-- 0003_profiles_self_insert.sql
-- Allow an authenticated user to create their own profiles row.
-- Normally the on_auth_user_created trigger handles this, but we make it self-
-- healing too: getCurrentUser() lazy-creates the row if missing.

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());
