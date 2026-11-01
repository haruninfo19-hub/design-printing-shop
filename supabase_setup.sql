-- Run this in Supabase Dashboard > SQL Editor.
-- Uses a new table so your existing public.orders table is not changed.
create extension if not exists pgcrypto;

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  public_id text unique not null,
  name text not null,
  phone text not null,
  print_type text not null,
  paper_size text not null,
  copies integer not null check (copies between 1 and 10000),
  delivery text not null,
  address text not null,
  payment text not null,
  trx_id text,
  notes text,
  file_name text not null,
  storage_path text not null,
  status text not null default 'নতুন অর্ডার',
  created_at timestamptz not null default now()
);

create index if not exists shop_orders_created_at_idx
  on public.shop_orders (created_at desc);
create index if not exists shop_orders_public_id_idx
  on public.shop_orders (public_id);

alter table public.shop_orders enable row level security;
-- No public policies: all access is performed by the server using the secret key.
-- Confirm Storage bucket "order-files" exists and is PRIVATE.
