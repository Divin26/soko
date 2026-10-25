-- The only authenticated order-entry endpoint validates the buyer's contact
-- and fills this column in the same transaction as the order rows. The
-- lower-level function is no longer callable by clients directly.
alter table public.orders alter column buyer_phone drop not null;
