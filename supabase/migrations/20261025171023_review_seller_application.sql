-- Atomically review a seller application and update its profile role.
create or replace function public.review_seller_application(
  p_application_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile_id uuid;
  v_application_status text;
  v_role text;
  v_user_status text;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Unsupported application decision';
  end if;

  select k.user_id, k.status
    into v_profile_id, v_application_status
  from public.kyc_requests k
  where k.id = p_application_id
  for update;
  if not found or v_profile_id is null then
    raise exception 'Seller application is not linked to a user';
  end if;
  if v_application_status <> 'pending' then
    raise exception 'Seller application is no longer pending';
  end if;

  if p_decision = 'approved' then
    select u.role, u.status into v_role, v_user_status
    from public.users u where u.id = v_profile_id for update;
    if not found or v_role <> 'buyer' or v_user_status <> 'active' then
      raise exception 'Applicant account is not eligible for seller approval';
    end if;
    update public.users
    set role = 'seller', verified = true
    where id = v_profile_id;
  end if;

  update public.kyc_requests
  set status = p_decision, reviewed_at = now()
  where id = p_application_id;
end
$function$;
revoke all on function public.review_seller_application(uuid, text) from public, anon;
grant execute on function public.review_seller_application(uuid, text) to authenticated;
