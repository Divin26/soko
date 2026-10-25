-- Orders must include a usable seller contact; callers only invoke this
-- wrapper, which snapshots that contact and delegates trusted price math to
-- the authoritative order function.
revoke all on function public.create_order_request(uuid,jsonb,text,text) from public,anon,authenticated;
create or replace function public.create_order_request_with_contact(
  p_checkout_id uuid,p_items jsonb,p_buyer_location text,p_delivery_method text,p_buyer_phone text
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_profile_id uuid := private.current_profile_id();
  v_phone text := regexp_replace(trim(coalesce(p_buyer_phone,'')), '[^0-9+]', '', 'g');
  v_result jsonb;
begin
  if auth.uid() is null or v_profile_id is null then
    raise exception 'Sign in with an active SOKO account before placing an order';
  end if;
  if v_phone !~ '^\+?[0-9]{7,15}$'
     or length(regexp_replace(v_phone,'[^0-9]','','g')) not between 7 and 15 then
    raise exception 'Enter a valid contact phone number';
  end if;
  v_result := public.create_order_request(p_checkout_id,p_items,p_buyer_location,p_delivery_method);
  update public.orders set buyer_phone=v_phone
    where checkout_id=p_checkout_id and buyer_id=v_profile_id;
  return v_result;
end
$function$;
revoke all on function public.create_order_request_with_contact(uuid,jsonb,text,text,text) from public,anon;
grant execute on function public.create_order_request_with_contact(uuid,jsonb,text,text,text) to authenticated;
