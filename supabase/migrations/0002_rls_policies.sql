-- 0002_rls_policies.sql
-- Row Level Security: clients can only access their own rows; admins can access everything.
-- qr_scans are inserted by the redirect handler using the service-role key (bypasses RLS).

------------------------------------------------------------
-- Helper: is_admin()
-- SECURITY DEFINER so RLS on profiles doesn't recursively block lookups.
------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated, anon;

------------------------------------------------------------
-- profiles
------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Inserts happen through the auth trigger (security definer). No insert policy needed.

------------------------------------------------------------
-- qr_codes
------------------------------------------------------------
alter table public.qr_codes enable row level security;

drop policy if exists "qr_codes_select_own_or_admin" on public.qr_codes;
create policy "qr_codes_select_own_or_admin"
  on public.qr_codes for select
  to authenticated
  using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "qr_codes_insert_own" on public.qr_codes;
create policy "qr_codes_insert_own"
  on public.qr_codes for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "qr_codes_update_own_or_admin" on public.qr_codes;
create policy "qr_codes_update_own_or_admin"
  on public.qr_codes for update
  to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "qr_codes_delete_own_or_admin" on public.qr_codes;
create policy "qr_codes_delete_own_or_admin"
  on public.qr_codes for delete
  to authenticated
  using (owner_id = auth.uid() or public.is_admin());

------------------------------------------------------------
-- qr_scans
------------------------------------------------------------
alter table public.qr_scans enable row level security;

drop policy if exists "qr_scans_select_for_owner_or_admin" on public.qr_scans;
create policy "qr_scans_select_for_owner_or_admin"
  on public.qr_scans for select
  to authenticated
  using (
    exists (
      select 1
      from public.qr_codes c
      where c.id = qr_code_id
        and (c.owner_id = auth.uid() or public.is_admin())
    )
  );

-- No insert/update/delete policies: writes go through the service-role client in the redirect handler.
