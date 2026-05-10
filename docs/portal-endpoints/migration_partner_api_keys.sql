-- Wird im Portal-Projekt pkpnowevagxmhyqlawng ausgeführt

create extension if not exists pgcrypto;

create table if not exists public.partner_api_keys (
  id uuid primary key default gen_random_uuid(),
  kundennummer text not null,
  token_hash text not null unique,
  name text,
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_partner_api_keys_kundennummer on public.partner_api_keys(kundennummer);
create index if not exists idx_partner_api_keys_active on public.partner_api_keys(is_active) where is_active = true;

alter table public.partner_api_keys enable row level security;
-- Keine PUBLIC policies — Zugriff ausschliesslich via Service Role in Edge Functions

create table if not exists public.partner_api_log (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  kundennummer text,
  status_code int,
  latency_ms int,
  request_id text,
  query jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_partner_api_log_created on public.partner_api_log(created_at desc);
create index if not exists idx_partner_api_log_kunde on public.partner_api_log(kundennummer, created_at desc);

alter table public.partner_api_log enable row level security;
