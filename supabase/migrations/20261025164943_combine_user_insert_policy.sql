drop policy if exists users_admin_insert on public.users;
drop policy if exists users_insert_own_buyer on public.users;

create policy users_insert_own_buyer_or_admin on public.users
  for insert to authenticated
  with check (
    private.is_admin()
    or (
      auth_id = (select auth.uid())
      and role = 'buyer'
      and verified is false
      and status = 'active'
    )
  );
