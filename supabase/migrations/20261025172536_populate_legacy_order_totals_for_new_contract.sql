-- Keep the original required orders.total and fee columns populated for
-- compatibility while storing the precise new buyer/seller breakdown.
create or replace function private.populate_order_totals()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if new.total is null then new.total := new.items_subtotal; end if;
  if new.commission is null then new.commission := coalesce(new.buyer_fee,0)+coalesce(new.seller_fee,0); end if;
  if new.seller_net is null and new.items_subtotal is not null then new.seller_net := new.items_subtotal-coalesce(new.seller_fee,0); end if;
  return new;
end
$function$;
revoke all on function private.populate_order_totals() from public,anon,authenticated;
drop trigger if exists trg_populate_order_totals on public.orders;
create trigger trg_populate_order_totals before insert or update on public.orders
for each row execute function private.populate_order_totals();
