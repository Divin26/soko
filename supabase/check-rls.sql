-- ============================================================
--  SOKO — Row Level Security audit
--  Read-only. Safe to run. Nothing here changes your database.
--
--  Run in: Supabase Dashboard → SQL Editor → New query
--  Paste the output back and I'll write the exact policies.
-- ============================================================


-- ── 1. Is RLS even switched on? ─────────────────────────────
-- Look for rls_enabled = true AND policies > 0 for every row.
-- "rls_enabled = false" means the table is wide open to the internet.
select
  c.relname             as table_name,
  c.relrowsecurity      as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  count(p.policyname)   as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p
       on p.schemaname = n.nspname
      and p.tablename  = c.relname
where n.nspname = 'public'
  and c.relkind = 'r'
group by 1, 2, 3
order by 1;


-- ── 2. What do the public-schema policies actually allow? ───
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- ── 3. Storage policies (product images) ────────────────────
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
order by tablename, policyname;

-- Which buckets exist, and are they public?
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;


-- ============================================================
--  HOW TO READ THIS
-- ============================================================
--  ✅ Safe      : users / kyc_submissions have rls_enabled = true and a
--                 policy that restricts rows to the owning user.
--  ⚠️ Exposed   : rls_enabled = false, OR rls_enabled = true with a policy
--                 whose qual is just "true" for role "anon"/"public".
--
--  Fastest independent check — open DevTools on your live site and paste:
--
--    fetch('/rest/v1/kyc_submissions?select=*&limit=1', {
--      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
--    }).then(r => r.json()).then(console.log)
--
--  An empty array [] = RLS is doing its job.
--  Actual rows        = anyone on the internet can read that table.


-- ============================================================
--  WHAT THE APP CURRENTLY REQUIRE (read before enabling anything)
-- ============================================================
--
--  RLS cannot simply be switched on today — the front end does things that
--  no anonymous browser should be able to do. From public/soko.html:
--
--  1. Pre-auth reads of `users`, before anyone has logged in:
--        doLogin()        → select email  from users where phone = ...
--        forgotPassword() → select email,role from users where phone = ...
--                           select role   from users where email = ...
--     Any policy strict enough to hide email/phone breaks phone login
--     and password reset.
--
--  2. Client-side privilege escalation, straight from the anon key:
--        users.update({ role: 'seller', verified: true })   ← KYC approval
--        kyc_submissions.update({ status: 'approved' })      ← admin action
--     With RLS off, any visitor can promote their own account.
--
--  3. KYC identity documents are stored as base64 text in a column
--        kyc_submissions.id_image = <data URL>
--     so a readable kyc_submissions table leaks full national ID photos.
--
--  4. `products` has no owner column — it stores seller_name / seller as
--     display strings, so there is no way to express "sellers own their
--     products" in RLS without a schema change (add seller_id uuid
--     references auth.users).
--
--  TARGET SHAPE (do not run until the API work above is done):
--
--    alter table public.users            enable row level security;
--    alter table public.products         enable row level security;
--    alter table public.kyc_submissions  enable row level security;
--
--    -- users: read/update only your own row (users.auth_id = auth.uid())
--    create policy "read own profile"   on public.users for select using (auth.uid() = auth_id);
--    create policy "update own profile" on public.users for update using (auth.uid() = auth_id);
--
--    -- products: public catalogue, but writes go through the API
--    create policy "browse products"    on public.products for select using (true);
--
--    -- kyc_submissions: no direct client access at all; the API (service_role,
--    -- which bypasses RLS) handles submit + admin approve/reject
--
--  Prerequisite: move the three privileged flows above into api/ functions
--  that hold SUPABASE_SERVICE_ROLE_KEY as a Vercel environment variable.
