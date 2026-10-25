-- Seller onboarding, private identity documents, seller store details, and the
-- single database-backed total commission setting (6% to start).

alter table public.users
  add column if not exists store_name text,
  add column if not exists whatsapp text,
  add column if not exists location text;

alter table public.kyc_requests
  add column if not exists user_id uuid references public.users(id) on delete cascade,
  add column if not exists id_image_path text,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz;

update public.kyc_requests
set submitted_at = coalesce(submitted_at, created_at, now())
where submitted_at is null;

create unique index if not exists kyc_requests_one_per_user
  on public.kyc_requests(user_id) where user_id is not null;
create index if not exists kyc_requests_user_status_idx
  on public.kyc_requests(user_id, status) where user_id is not null;

create table if not exists public.platform_settings (
  id boolean primary key default true check (id is true),
  commission_rate_bps integer not null default 600
    check (commission_rate_bps between 0 and 5000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.platform_settings(id, commission_rate_bps)
values (true, 600)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
drop policy if exists platform_settings_public_read on public.platform_settings;
drop policy if exists platform_settings_admin_update on public.platform_settings;
create policy platform_settings_public_read on public.platform_settings
  for select to anon, authenticated using (true);
create policy platform_settings_admin_update on public.platform_settings
  for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
revoke all on public.platform_settings from public, anon, authenticated;
grant select on public.platform_settings to anon, authenticated;
grant update on public.platform_settings to authenticated;

create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select u.id
  from public.users u
  where u.auth_id = (select auth.uid())
    and u.status = 'active'
  limit 1;
$function$;
revoke all on function private.current_profile_id() from public, anon;
grant execute on function private.current_profile_id() to authenticated;

create or replace function private.is_approved_seller()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid())
      and u.role = 'seller'
      and u.verified is true
      and u.status = 'active'
  );
$function$;
revoke all on function private.is_approved_seller() from public, anon;
grant execute on function private.is_approved_seller() to authenticated;

create policy kyc_requests_read_own on public.kyc_requests
  for select to authenticated
  using (user_id = (select private.current_profile_id()));

create or replace function public.submit_seller_application(
  p_full_name text,
  p_id_number text,
  p_id_image_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile_id uuid;
  v_auth_id uuid;
  v_role text;
  v_verified boolean;
  v_status text;
  v_phone text;
  v_request_id uuid;
  v_request_status text;
begin
  v_auth_id := (select auth.uid());
  v_profile_id := private.current_profile_id();
  if v_auth_id is null or v_profile_id is null then
    raise exception 'Sign in before applying to sell';
  end if;

  select u.role, u.verified, u.status, u.phone
    into v_role, v_verified, v_status, v_phone
  from public.users u where u.id = v_profile_id;
  if v_status <> 'active' or v_role <> 'buyer' or v_verified is true then
    raise exception 'This account is not eligible for seller onboarding';
  end if;
  if p_full_name is null or length(trim(p_full_name)) not between 3 and 120 then
    raise exception 'Enter your full legal name';
  end if;
  if p_id_number is null or length(trim(p_id_number)) not between 5 and 64 then
    raise exception 'Enter a valid national ID number';
  end if;
  if p_id_image_path is null
     or left(p_id_image_path, length(v_auth_id::text) + 1) <> v_auth_id::text || '/'
     or position('..' in p_id_image_path) > 0
     or right(lower(p_id_image_path), 5) <> '.webp'
     or not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'seller-id-documents'
         and o.name = p_id_image_path
     ) then
    raise exception 'Upload a valid ID image before submitting';
  end if;

  select k.id, k.status into v_request_id, v_request_status
  from public.kyc_requests k where k.user_id = v_profile_id for update;
  if v_request_status = 'pending' then
    raise exception 'Your seller application is already under review';
  elsif v_request_status = 'approved' then
    raise exception 'Your seller application has already been approved';
  elsif v_request_id is not null then
    update public.kyc_requests
    set name = trim(p_full_name), phone = v_phone,
        id_number = trim(p_id_number), id_image_path = p_id_image_path,
        status = 'pending', submitted_at = now(), reviewed_at = null
    where id = v_request_id;
  else
    insert into public.kyc_requests
      (user_id, name, phone, id_number, id_image_path, status, submitted_at)
    values
      (v_profile_id, trim(p_full_name), v_phone, trim(p_id_number),
       p_id_image_path, 'pending', now())
    returning id into v_request_id;
  end if;
  return v_request_id;
end
$function$;
revoke all on function public.submit_seller_application(text, text, text) from public, anon;
grant execute on function public.submit_seller_application(text, text, text) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('seller-id-documents', 'seller-id-documents', false, 5242880,
   array['image/webp','image/jpeg','image/png']),
  ('product-images', 'product-images', true, 5242880,
   array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists seller_id_documents_insert_own on storage.objects;
drop policy if exists seller_id_documents_read_own_or_admin on storage.objects;
drop policy if exists seller_id_documents_delete_own on storage.objects;
create policy seller_id_documents_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'seller-id-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy seller_id_documents_read_own_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'seller-id-documents'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.is_admin()
    )
  );
create policy seller_id_documents_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'seller-id-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists product_images_public_read on storage.objects;
drop policy if exists product_images_insert_seller on storage.objects;
drop policy if exists product_images_update_seller on storage.objects;
drop policy if exists product_images_delete_seller on storage.objects;
create policy product_images_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'product-images');
create policy product_images_insert_seller on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.is_approved_seller()
  );
create policy product_images_update_seller on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.is_approved_seller()
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.is_approved_seller()
  );
create policy product_images_delete_seller on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.is_approved_seller()
  );
