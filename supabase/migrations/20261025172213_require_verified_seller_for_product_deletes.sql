drop policy if exists products_delete_owner_or_admin on public.products;
create policy products_delete_approved_seller_or_admin on public.products
  for delete to authenticated
  using (
    private.is_admin()
    or (seller_id=(select private.current_profile_id()) and (select private.is_approved_seller()))
  );
