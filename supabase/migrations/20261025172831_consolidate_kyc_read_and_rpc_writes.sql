-- Applicants can read their own request and administrators can review all
-- requests. Creation and review are only available through validated RPCs.
drop policy if exists kyc_admin_read on public.kyc_requests;
drop policy if exists kyc_requests_read_own on public.kyc_requests;
drop policy if exists kyc_admin_insert on public.kyc_requests;
drop policy if exists kyc_admin_update on public.kyc_requests;
create policy kyc_read_owner_or_admin on public.kyc_requests
  for select to authenticated
  using (user_id=(select private.current_profile_id()) or private.is_admin());
revoke insert,update,delete on public.kyc_requests from public,anon,authenticated;
grant select on public.kyc_requests to authenticated;
