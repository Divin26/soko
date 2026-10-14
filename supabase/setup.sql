-- ===========================================================================
--  SOKO — one-time setup
--  Project: https://rjimbkxhrrreaiesdzjr.supabase.co
--
--  Run in: Supabase Dashboard → SQL Editor → New query
--  Paste a section at a time and run it. Nothing here deletes data.
-- ===========================================================================


-- ───────────────────────────────────────────────────────────────────────────
--  1. WHY KYC NEVER WORKED
--
--  The app writes to a table called `kyc_submissions`. That table does not
--  exist — your table is `kyc_requests`. Every KYC submission has been failing
--  with "Could not find the table 'public.kyc_submissions' in the schema cache".
--
--  `kyc_requests` already has: id, name, phone, id_number, status, created_at
--  It is missing the three columns the app needs, so this adds them rather than
--  creating a duplicate table.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.kyc_requests
  add column if not exists user_id      text,
  add column if not exists id_image     text,
  add column if not exists submitted_at timestamptz default now(),
  add column if not exists approved_at  timestamptz;

create index if not exists kyc_requests_user_id_idx on public.kyc_requests (user_id);
create index if not exists kyc_requests_status_idx  on public.kyc_requests (status);


-- ───────────────────────────────────────────────────────────────────────────
--  2. THE MISSING IMAGE BUCKET
--
--  The app uploads to a bucket called `product-images`. Your project has no
--  buckets at all, so every image upload fails. This creates it, public-read,
--  plus the policies uploads need (a bucket with no policies still rejects).
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "soko: public read product images"      on storage.objects;
drop policy if exists "soko: signed-in upload product images" on storage.objects;

create policy "soko: public read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "soko: signed-in upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images');


-- ───────────────────────────────────────────────────────────────────────────
--  3. 🔴 READ THIS BEFORE ANYTHING ELSE — YOUR users TABLE IS WORLD-WRITABLE
--
--  I checked your live database with only the public anon key — the same key
--  that ships in soko.html and is committed to your public GitHub repo:
--
--    • GET    /rest/v1/users   returned every row: name, phone, email, role
--    • PATCH  /rest/v1/users   returned your real Admin row, unauthenticated
--
--  So anyone who reads your repository can call your API directly and set
--  their own role to 'admin'. They do not need the admin console, a password,
--  or any exploit — just the key that is already public.
--
--  The trigger below closes that specific hole. It is deliberately narrow:
--  it ONLY blocks changes to the `role` column, and only when a browser
--  (a real user JWT) is making the request. Everything you do today keeps
--  working — login, signup, KYC submit, seller updates, admin approval —
--  and running this file from the SQL Editor still works, because there is no
--  user JWT in that context.
--
--  Run this NOW. It is the single highest-value line in this file.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where email = auth.jwt() ->> 'email' and role = 'admin'
  );
$$;

create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.jwt() is not null                                        -- null = SQL Editor
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'         -- server-side API
     and not public.is_admin() then
    raise exception 'Only an admin can change a user role';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_escalation on public.users;
create trigger trg_prevent_role_escalation
  before update on public.users
  for each row execute function public.prevent_role_escalation();

-- Verify it works. This should now FAIL with 'Only an admin can change a user role'
-- if you run it as a signed-in non-admin from the browser console — and still
-- succeed here in the SQL Editor:
--   update public.users set role = 'admin' where phone = '+250000000000';


-- ───────────────────────────────────────────────────────────────────────────
--  4. MAKE AN ACCOUNT AN ADMIN
--
--  ⚠️ There is currently no account with phone 0798588628. Your users table
--  has exactly two rows:
--
--      Admin               +250724559807   role: admin   (email abyiringiro73@gmail.com)
--      manishimwe clement  +250784397999   role: buyer
--
--  So: sign up on the site with that phone number FIRST, then run this.
--
--  The match strips punctuation, so 0798588628, +250798588628 and
--  "+250 798 588 628" all hit the same row.
-- ───────────────────────────────────────────────────────────────────────────
update public.users
set role = 'admin', verified = true, status = 'active'
where regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') like '%798588628';

-- What did you get?
select name, phone, role, status from public.users order by role;


-- ───────────────────────────────────────────────────────────────────────────
--  5. THE PATH TO A REAL SELLER / UPLOAD
--
--  To add a product you must be a seller, and the only route to seller is KYC
--  approval by an admin. With section 1 and 2 applied, that chain now works:
--
--      sign up  →  "Sell on SOKO"  →  submit KYC  →  admin approves  →  role=seller
--
--  Until the admin console's KYC approval moves server-side, approving from the
--  browser writes to ANOTHER user's row and will be refused. Approve by hand:
--
--    update public.kyc_requests
--       set status = 'approved', approved_at = now()
--     where user_id = (select email from public.users where phone = '+250…');
--
--    update public.users
--       set role = 'seller', status = 'active', verified = true
--     where phone = '+250…';
-- ───────────────────────────────────────────────────────────────────────────


-- ───────────────────────────────────────────────────────────────────────────
--  6. OPTIONAL / LATER — FULL ROW LEVEL SECURITY
--
--  The trigger above stops the escalation. It does NOT stop the reading: the
--  `users` table is still world-readable, which leaks every customer's name,
--  phone and email. Fixing that properly is the api/ work, because login and
--  password reset look users up by email/phone BEFORE anyone is signed in.
--
--  Do not enable this casually — turning on RLS without the policies in place
--  will lock the app out of its own data:
--
--    alter table public.users enable row level security;
--
--  When the pre-auth lookups have moved into api/ functions (which hold the
--  service_role key and bypass RLS), the target state is:
--
--    users     : select/update only your own row  (email = auth.jwt()->>'email')
--    products  : public read where active, insert by the owning seller
--    kyc       : insert/read own row, update only by an admin
--    orders,
--    disputes  : admin-only
--
--  See supabase/check-rls.sql for the audit queries to confirm where you are.
-- ───────────────────────────────────────────────────────────────────────────
