-- Authoritative order requests with immutable buyer/seller fee snapshots.
-- Orders remain unpaid until Rwanda payment-provider onboarding and callbacks
-- are implemented; creating a request never marks money as collected/escrowed.

alter table public.orders
  add column if not exists checkout_id uuid,
  add column if not exists buyer_id uuid references public.users(id),
  add column if not exists seller_id uuid references public.users(id),
  add column if not exists unit_price integer,
  add column if not exists items_subtotal integer,
  add column if not exists buyer_fee integer,
  add column if not exists seller_fee integer,
  add column if not exists buyer_total integer,
  add column if not exists commission_rate_bps integer,
  add column if not exists payment_status text not null default 'legacy_unverified';

create index if not exists orders_buyer_created_idx
  on public.orders(buyer_id, created_at desc) where buyer_id is not null;
create index if not exists orders_seller_created_idx
  on public.orders(seller_id, created_at desc) where seller_id is not null;
create index if not exists orders_checkout_id_idx
  on public.orders(checkout_id) where checkout_id is not null;

drop policy if exists orders_admin_read on public.orders;
drop policy if exists orders_admin_update on public.orders;
create policy orders_read_participant_or_admin on public.orders
  for select to authenticated
  using (
    private.is_admin()
    or buyer_id = (select private.current_profile_id())
    or seller_id = (select private.current_profile_id())
  );
revoke insert, update, delete on public.orders from anon, authenticated;
grant select on public.orders to authenticated;

create or replace function public.create_order_request(
  p_checkout_id uuid,
  p_items jsonb,
  p_buyer_location text,
  p_delivery_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth_id uuid := (select auth.uid());
  v_buyer_id uuid := private.current_profile_id();
  v_item jsonb;
  v_product public.products%rowtype;
  v_rate integer;
  v_buyer_rate integer;
  v_seller_rate integer;
  v_qty integer;
  v_subtotal integer;
  v_buyer_fee integer;
  v_seller_fee integer;
  v_items_count integer;
  v_total integer := 0;
  v_total_buyer_fee integer := 0;
  v_total_seller_fee integer := 0;
  v_existing_buyer_total integer;
  v_existing_count integer;
  v_order_id text;
begin
  if v_auth_id is null or v_buyer_id is null then
    raise exception 'Sign in with an active SOKO account before placing an order';
  end if;
  if p_checkout_id is null then raise exception 'Checkout reference is missing'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'A checkout must contain between 1 and 20 items';
  end if;
  if p_buyer_location is null or length(trim(p_buyer_location)) not between 2 and 120 then
    raise exception 'Enter a delivery or pickup location';
  end if;
  if p_delivery_method not in ('delivery','pickup') then
    raise exception 'Choose delivery or pickup';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_checkout_id::text));
  select count(*) into v_existing_count from public.orders o
    where o.checkout_id = p_checkout_id and o.buyer_id = v_buyer_id;
  if v_existing_count > 0 then
    select coalesce(sum(o.items_subtotal),0), coalesce(sum(o.buyer_fee),0),
           coalesce(sum(o.seller_fee),0), coalesce(sum(o.buyer_total),0)
      into v_total, v_total_buyer_fee, v_total_seller_fee, v_existing_buyer_total
      from public.orders o where o.checkout_id=p_checkout_id and o.buyer_id=v_buyer_id;
    return jsonb_build_object('checkout_id',p_checkout_id,'items_subtotal',v_total,
      'buyer_fee',v_total_buyer_fee,'seller_fee',v_total_seller_fee,'buyer_total',v_existing_buyer_total,'reused',true);
  end if;

  -- Lock every requested product in a stable order so concurrent checkouts
  -- serialize inventory checks. Prices and quantities are read from DB rows.
  for v_item in
    select value from jsonb_array_elements(p_items)
    order by value->>'product_id'
  loop
    if coalesce(v_item->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_item->>'quantity','') !~ '^[0-9]{1,2}$' then
      raise exception 'An item in your cart is invalid';
    end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 99 then raise exception 'Item quantities must be between 1 and 99'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct value->>'product_id') from jsonb_array_elements(p_items)) then
    raise exception 'Remove duplicate product rows from your cart and try again';
  end if;

  perform p.id from public.products p
    where p.id in (select (value->>'product_id')::uuid from jsonb_array_elements(p_items))
    order by p.id for update;

  select s.commission_rate_bps into v_rate from public.platform_settings s where s.id is true;
  if v_rate is null then raise exception 'Commission settings are unavailable'; end if;
  v_buyer_rate := (v_rate + 1) / 2;
  v_seller_rate := v_rate / 2;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products p where p.id=(v_item->>'product_id')::uuid;
    if not found or v_product.active is not true or v_product.seller_id is null then
      raise exception 'One or more products are no longer available for checkout';
    end if;
    if v_product.stock < v_qty then
      raise exception 'Not enough stock for %', v_product.name;
    end if;
    if not exists(select 1 from public.users u where u.id=v_product.seller_id and u.role='seller' and u.verified is true and u.status='active') then
      raise exception 'A seller on this order is not currently eligible';
    end if;
    if v_product.seller_id=v_buyer_id then raise exception 'You cannot order your own product'; end if;

    v_subtotal := v_product.price * v_qty;
    v_buyer_fee := round(v_subtotal::numeric * v_buyer_rate / 10000)::integer;
    v_seller_fee := round(v_subtotal::numeric * v_seller_rate / 10000)::integer;
    v_order_id := gen_random_uuid()::text;
    insert into public.orders(
      id,checkout_id,buyer_id,seller_id,buyer_name,buyer_phone,buyer_location,
      product_name,product_id,quantity,unit_price,items_subtotal,buyer_fee,seller_fee,
      buyer_total,commission,commission_rate_bps,seller_net,payment_method,delivery_method,
      status,escrow_status,payment_status,seller_name
    ) values (
      v_order_id,p_checkout_id,v_buyer_id,v_product.seller_id,
      (select u.name from public.users u where u.id=v_buyer_id),
      (select u.phone from public.users u where u.id=v_buyer_id),trim(p_buyer_location),
      v_product.name,v_product.id,v_qty,v_product.price,v_subtotal,v_buyer_fee,v_seller_fee,
      v_subtotal+v_buyer_fee,v_buyer_fee+v_seller_fee,v_rate,
      v_subtotal-v_seller_fee,'provider_not_configured',p_delivery_method,
      'awaiting_payment','not_started','not_started',coalesce(v_product.seller_name,v_product.seller,'Seller')
    );
    v_total:=v_total+v_subtotal;v_total_buyer_fee:=v_total_buyer_fee+v_buyer_fee;v_total_seller_fee:=v_total_seller_fee+v_seller_fee;
  end loop;
  return jsonb_build_object('checkout_id',p_checkout_id,'items_subtotal',v_total,
    'buyer_fee',v_total_buyer_fee,'seller_fee',v_total_seller_fee,
    'buyer_total',v_total+v_total_buyer_fee,'payment_status','not_started','reused',false);
end
$function$;
revoke all on function public.create_order_request(uuid,jsonb,text,text) from public, anon;
grant execute on function public.create_order_request(uuid,jsonb,text,text) to authenticated;
