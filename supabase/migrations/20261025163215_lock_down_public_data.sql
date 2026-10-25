-- Replace permissive public policies with identity-scoped access.
-- This migration is based on the live schema inspected on 2026-10-25.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated, service_role;

-- Link admin profiles only to the Auth identity with the same email. This is
-- safe to re-run and does not embed private phone or email identifiers.
update public.users u
set auth_id = a.id
from auth.users a
where u.role = 'admin'
  and u.auth_id is null
  and lower(a.email) = lower(u.email);

-- A narrowly scoped helper avoids recursive users-table RLS when checking the
-- admin role. It exposes only a boolean for the currently authenticated UUID.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.users u
    where u.auth_id = (select auth.uid())
      and u.role = 'admin'
      and u.status = 'active'
  );
$function$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

-- Durable coarse rate limit for the unauthenticated phone-login/recovery
-- function. Only a service-role Edge Function may call the RPC.
create table if not exists private.phone_auth_attempts (
  client_hash text not null,
  bucket_start timestamptz not null,
  attempts integer not null default 0,
  primary key (client_hash, bucket_start)
);
revoke all on private.phone_auth_attempts from public, anon, authenticated;

create or replace function public.claim_phone_auth_attempt(p_client_ip text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash text;
  v_bucket timestamptz;
  v_attempts integer;
begin
  if p_client_ip is null or length(p_client_ip) > 100 then
    return false;
  end if;
  v_hash := encode(extensions.digest(p_client_ip, 'sha256'), 'hex');
  v_bucket := date_bin('15 minutes', clock_timestamp(), timestamptz '2000-01-01 00:00:00+00');
  delete from private.phone_auth_attempts
    where bucket_start < v_bucket - interval '1 day';
  insert into private.phone_auth_attempts(client_hash, bucket_start, attempts)
    values (v_hash, v_bucket, 1)
  on conflict (client_hash, bucket_start)
    do update set attempts = private.phone_auth_attempts.attempts + 1
  returning attempts into v_attempts;
  return v_attempts <= 10;
end
$function$;
revoke all on function public.claim_phone_auth_attempt(text) from public, anon, authenticated;
grant execute on function public.claim_phone_auth_attempt(text) to service_role;

-- Remove password-like data from the profile table; it is not used by the app
-- and Auth is the only supported credential store.
alter table public.users drop column if exists password;

-- Enforce immutable identity and privilege fields for non-admin profile edits.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
     and not private.is_admin()
     and (
       new.id is distinct from old.id
       or new.auth_id is distinct from old.auth_id
       or new.email is distinct from old.email
       or new.phone is distinct from old.phone
       or new.role is distinct from old.role
       or new.verified is distinct from old.verified
       or new.status is distinct from old.status
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'Protected profile fields can only be changed by an administrator';
  end if;
  return new;
end
$function$;
revoke all on function public.prevent_role_escalation() from public, anon, authenticated;
drop trigger if exists trg_prevent_role_escalation on public.users;
create trigger trg_prevent_role_escalation
  before update on public.users
  for each row execute function public.prevent_role_escalation();

-- Replace every existing policy on the affected live tables so permissive
-- policies cannot continue OR-ing together.
do $policies$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('users','products','orders','kyc_requests','reviews','disputes')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end
$policies$;

alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.kyc_requests enable row level security;
alter table public.reviews enable row level security;
alter table public.disputes enable row level security;

create policy users_read_self_or_admin on public.users
  for select to authenticated
  using (auth_id = (select auth.uid()) or private.is_admin());
create policy users_insert_own_buyer on public.users
  for insert to authenticated
  with check (
    auth_id = (select auth.uid())
    and role = 'buyer'
    and verified is false
    and status = 'active'
  );
create policy users_admin_insert on public.users
  for insert to authenticated
  with check (private.is_admin());
create policy users_update_self_or_admin on public.users
  for update to authenticated
  using (auth_id = (select auth.uid()) or private.is_admin())
  with check (auth_id = (select auth.uid()) or private.is_admin());

create policy products_read_public_active on public.products
  for select to anon, authenticated
  using (active is true or private.is_admin());
create policy products_insert_owner_or_admin on public.products
  for insert to authenticated
  with check (
    private.is_admin()
    or seller_id = (
      select u.id from public.users u
      where u.auth_id = (select auth.uid()) and u.role = 'seller'
      limit 1
    )
  );
create policy products_update_owner_or_admin on public.products
  for update to authenticated
  using (
    private.is_admin()
    or seller_id = (
      select u.id from public.users u
      where u.auth_id = (select auth.uid()) and u.role = 'seller'
      limit 1
    )
  )
  with check (
    private.is_admin()
    or seller_id = (
      select u.id from public.users u
      where u.auth_id = (select auth.uid()) and u.role = 'seller'
      limit 1
    )
  );
create policy products_delete_owner_or_admin on public.products
  for delete to authenticated
  using (
    private.is_admin()
    or seller_id = (
      select u.id from public.users u
      where u.auth_id = (select auth.uid()) and u.role = 'seller'
      limit 1
    )
  );

-- Orders have no buyer_id or seller_id yet. Keep them visible/editable only to
-- admins until Phase 2 adds ownership and a server-authoritative order flow.
create policy orders_admin_read on public.orders
  for select to authenticated using (private.is_admin());
create policy orders_admin_update on public.orders
  for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- KYC rows have no owning Auth UUID or protected image path yet; admin access
-- only until the Phase 3 schema and private-storage workflow are added.
create policy kyc_admin_read on public.kyc_requests
  for select to authenticated using (private.is_admin());
create policy kyc_admin_insert on public.kyc_requests
  for insert to authenticated with check (private.is_admin());
create policy kyc_admin_update on public.kyc_requests
  for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy reviews_read_public on public.reviews
  for select to anon, authenticated using (true);
create policy reviews_insert_self on public.reviews
  for insert to authenticated
  with check (
    buyer_id = (
      select u.id from public.users u where u.auth_id = (select auth.uid()) limit 1
    )
  );

create policy disputes_read_owner_or_admin on public.disputes
  for select to authenticated
  using (
    private.is_admin()
    or buyer_id = (
      select u.id from public.users u where u.auth_id = (select auth.uid()) limit 1
    )
  );
create policy disputes_insert_owner on public.disputes
  for insert to authenticated
  with check (
    buyer_id = (
      select u.id from public.users u where u.auth_id = (select auth.uid()) limit 1
    )
  );
create policy disputes_admin_update on public.disputes
  for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
