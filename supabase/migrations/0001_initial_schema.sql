-- 0001_initial_schema.sql
-- Core schema for the agency platform: profiles, qr_codes, qr_scans.

create extension if not exists "pgcrypto";

------------------------------------------------------------
-- profiles
------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('client', 'admin');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'client',
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);

-- Auto-create a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

------------------------------------------------------------
-- qr_codes
------------------------------------------------------------
create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  destination_url text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  slug text not null unique,
  final_url text not null,
  image_url text,
  image_public_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qr_codes_owner_id_idx on public.qr_codes(owner_id);
create index if not exists qr_codes_slug_idx on public.qr_codes(slug);
create index if not exists qr_codes_created_at_idx on public.qr_codes(created_at desc);

drop trigger if exists qr_codes_set_updated_at on public.qr_codes;
create trigger qr_codes_set_updated_at
  before update on public.qr_codes
  for each row execute function public.set_updated_at();

------------------------------------------------------------
-- qr_scans
------------------------------------------------------------
create table if not exists public.qr_scans (
  id uuid primary key default gen_random_uuid(),
  qr_code_id uuid not null references public.qr_codes(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  user_agent text,
  referrer text,
  country text
);

create index if not exists qr_scans_qr_code_id_idx on public.qr_scans(qr_code_id);
create index if not exists qr_scans_scanned_at_idx on public.qr_scans(scanned_at desc);
