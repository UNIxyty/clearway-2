-- Corporate auth tables for shared account + per-device profile.
-- Run this SQL in Supabase SQL editor.

create table if not exists corporate_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists device_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references corporate_accounts(id) on delete cascade,
  display_name text,
  ip_address text,
  device_name text,
  created_at timestamptz not null default now()
);

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  device_profile_id uuid not null references device_profiles(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Seed corporate admin/admin (SHA-256 hash of "admin")
insert into corporate_accounts (username, password_hash)
values ('admin', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918')
on conflict (username) do nothing;

