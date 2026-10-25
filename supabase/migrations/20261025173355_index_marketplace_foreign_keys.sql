create index if not exists orders_product_id_idx on public.orders(product_id) where product_id is not null;
create index if not exists platform_settings_updated_by_idx on public.platform_settings(updated_by) where updated_by is not null;
create index if not exists products_seller_id_idx on public.products(seller_id) where seller_id is not null;
create index if not exists disputes_buyer_id_idx on public.disputes(buyer_id) where buyer_id is not null;
create index if not exists disputes_order_id_idx on public.disputes(order_id) where order_id is not null;
create index if not exists reviews_buyer_id_idx on public.reviews(buyer_id) where buyer_id is not null;
create index if not exists reviews_product_id_idx on public.reviews(product_id) where product_id is not null;
