-- Only active, verified sellers may create or edit product rows. Admins retain
-- their operational access; buyers and unverified accounts cannot self-list.
drop policy if exists products_insert_owner_or_admin on public.products;
drop policy if exists products_update_owner_or_admin on public.products;
create policy products_insert_approved_seller_or_admin on public.products
  for insert to authenticated
  with check (
    private.is_admin()
    or (seller_id=(select private.current_profile_id()) and (select private.is_approved_seller()))
  );
create policy products_update_approved_seller_or_admin on public.products
  for update to authenticated
  using (
    private.is_admin()
    or (seller_id=(select private.current_profile_id()) and (select private.is_approved_seller()))
  )
  with check (
    private.is_admin()
    or (seller_id=(select private.current_profile_id()) and (select private.is_approved_seller()))
  );
