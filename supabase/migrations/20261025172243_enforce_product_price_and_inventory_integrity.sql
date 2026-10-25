-- A live inventory count must always be known and nonnegative. Existing NULL
-- stock is conservatively treated as zero; existing product prices were
-- audited before adding these constraints.
update public.products set stock=0 where stock is null;
alter table public.products
  alter column stock set default 0,
  alter column stock set not null,
  alter column price set not null;
do $constraints$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_stock_nonnegative') then
    alter table public.products add constraint products_stock_nonnegative check(stock>=0);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_price_positive') then
    alter table public.products add constraint products_price_positive check(price>0);
  end if;
end
$constraints$;
