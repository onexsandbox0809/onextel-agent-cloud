-- ═══════════════════════════════════════════════════════════════════════════
-- Onextel Agent Cloud — Supabase schema
-- Multi-tenant control plane for Meta Business Agents on WhatsApp.
-- Run in Supabase SQL editor (or `supabase db push`) before deploying.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ── enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type user_role as enum ('platform_admin','tenant_admin','operator','viewer');
exception when duplicate_object then null; end $$;
do $$ begin
  create type agent_status as enum ('draft','in_review','live','paused','failed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type number_status as enum ('provisioning','pending_registration','active','suspended');
exception when duplicate_object then null; end $$;

-- ── tenants ─────────────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id text primary key,
  name text not null,
  slug text unique not null,
  plan text not null default 'growth',
  status text not null default 'trial',
  region text not null default 'IN',
  meta_business_id text,
  billing_email text,
  seats int not null default 5,
  accent text default '#C9F45B',
  created_at timestamptz not null default now()
);

-- ── profiles (1:1 with auth.users) ──────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id text references public.tenants(id) on delete set null,
  name text,
  email text,
  role user_role not null default 'viewer',
  status text not null default 'active',
  avatar_hue int default 74,
  last_active timestamptz default now(),
  created_at timestamptz not null default now()
);

create or replace function public.current_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_tenant() returns text
language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'platform_admin' from public.profiles where id = auth.uid()), false);
$$;

-- ── agents (configuration stored as JSONB documents) ────────────────────────
create table if not exists public.agents (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  status agent_status not null default 'draft',
  entity_id text not null,                 -- WhatsApp phone number ID = {ENTITY_ID} in Graph calls
  meta_agent_id text,                      -- returned by agent_onboarding
  phone_number_id text,
  version int not null default 1,
  health int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  business_info jsonb not null default '{}'::jsonb,
  faqs jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  connectors jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  unique (tenant_id, slug)
);
create index if not exists agents_tenant_idx on public.agents(tenant_id, status);
create index if not exists agents_entity_idx on public.agents(entity_id);

-- ── phone numbers ───────────────────────────────────────────────────────────
create table if not exists public.phone_numbers (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  agent_id text references public.agents(id) on delete set null,
  display text not null,
  wa_phone_number_id text not null unique,
  waba_id text not null,
  provider text not null default 'onextel',
  provider_ref text,
  status number_status not null default 'pending_registration',
  quality text not null default 'green',
  messaging_limit text default '1K / 24h',
  country text default 'IN',
  category text default 'OTHER',
  registered_at timestamptz,
  two_step_pin_set boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── conversations / messages ────────────────────────────────────────────────
create table if not exists public.conversations (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  agent_id text references public.agents(id) on delete set null,
  customer text not null,
  handle text not null,
  status text not null default 'open',
  csat numeric,
  unread int not null default 0,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ── credentials (store ciphertext only; decrypt in an Edge Function) ────────
create table if not exists public.credentials (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  name text not null,
  kind text not null,
  masked text not null,
  ciphertext text,                       -- pgp_sym_encrypt(value, app_secret)
  environment text not null default 'production',
  status text not null default 'active',
  last_rotated timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- ── eval cases / runs ───────────────────────────────────────────────────────
create table if not exists public.eval_cases (
  id text primary key,
  agent_id text not null references public.agents(id) on delete cascade,
  tenant_id text not null references public.tenants(id) on delete cascade,
  name text not null,
  category text default 'General',
  input text,
  expected text,
  last_result text default 'not_run',
  last_run_at timestamptz
);

create table if not exists public.eval_runs (
  id text primary key,
  agent_id text not null references public.agents(id) on delete cascade,
  tenant_id text not null references public.tenants(id) on delete cascade,
  job_id text,
  status text default 'queued',
  score int,
  cases_total int,
  cases_passed int,
  started_at timestamptz default now()
);

-- ── audit + webhooks ────────────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id bigserial primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  actor text not null,
  action text not null,
  target text,
  severity text not null default 'info',
  ip text,
  at timestamptz not null default now()
);
create index if not exists audit_tenant_idx on public.audit_logs(tenant_id, at desc);

create table if not exists public.webhook_events (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  agent_id text,
  type text not null,
  status text default 'processed',
  latency_ms int,
  payload jsonb,
  at timestamptz not null default now()
);

-- ── usage rollups (for analytics / billing) ─────────────────────────────────
create table if not exists public.usage_daily (
  tenant_id text not null references public.tenants(id) on delete cascade,
  agent_id text not null,
  day date not null,
  conversations int not null default 0,
  resolved int not null default 0,
  handoffs int not null default 0,
  cost_paise int not null default 0,
  primary key (tenant_id, agent_id, day)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.agents enable row level security;
alter table public.phone_numbers enable row level security;
alter table public.conversations enable row level security;
alter table public.credentials enable row level security;
alter table public.eval_cases enable row level security;
alter table public.eval_runs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.webhook_events enable row level security;
alter table public.usage_daily enable row level security;

drop policy if exists tenants_read on public.tenants;
create policy tenants_read on public.tenants for select using (public.is_platform_admin() or id = public.current_tenant());

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.is_platform_admin() or tenant_id = public.current_tenant());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists agents_read on public.agents;
create policy agents_read on public.agents for select
  using (public.is_platform_admin() or tenant_id = public.current_tenant());
drop policy if exists agents_write on public.agents;
create policy agents_write on public.agents for all
  using (public.is_platform_admin() or (tenant_id = public.current_tenant() and public.current_role() in ('tenant_admin','operator')))
  with check (public.is_platform_admin() or tenant_id = public.current_tenant());

drop policy if exists numbers_read on public.phone_numbers;
create policy numbers_read on public.phone_numbers for select
  using (public.is_platform_admin() or tenant_id = public.current_tenant());
drop policy if exists numbers_write on public.phone_numbers;
create policy numbers_write on public.phone_numbers for all
  using (public.is_platform_admin() or (tenant_id = public.current_tenant() and public.current_role() in ('tenant_admin','operator')))
  with check (public.is_platform_admin() or tenant_id = public.current_tenant());

drop policy if exists convos_read on public.conversations;
create policy convos_read on public.conversations for select
  using (public.is_platform_admin() or tenant_id = public.current_tenant());
drop policy if exists convos_write on public.conversations;
create policy convos_write on public.conversations for all
  using (public.is_platform_admin() or tenant_id = public.current_tenant())
  with check (public.is_platform_admin() or tenant_id = public.current_tenant());

drop policy if exists creds_read on public.credentials;
create policy creds_read on public.credentials for select
  using (public.is_platform_admin() or (tenant_id = public.current_tenant() and public.current_role() = 'tenant_admin'));

drop policy if exists evals_all on public.eval_cases;
create policy evals_all on public.eval_cases for all
  using (public.is_platform_admin() or tenant_id = public.current_tenant())
  with check (public.is_platform_admin() or tenant_id = public.current_tenant());
drop policy if exists evalruns_all on public.eval_runs;
create policy evalruns_all on public.eval_runs for all
  using (public.is_platform_admin() or tenant_id = public.current_tenant())
  with check (public.is_platform_admin() or tenant_id = public.current_tenant());

drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select
  using (public.is_platform_admin() or tenant_id = public.current_tenant());

drop policy if exists hooks_read on public.webhook_events;
create policy hooks_read on public.webhook_events for select
  using (public.is_platform_admin() or tenant_id = public.current_tenant());

drop policy if exists usage_read on public.usage_daily;
create policy usage_read on public.usage_daily for select
  using (public.is_platform_admin() or tenant_id = public.current_tenant());

-- ── profile bootstrap on signup ─────────────────────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          coalesce((new.raw_user_meta_data->>'role')::user_role, 'viewer'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists agents_touch on public.agents;
create trigger agents_touch before update on public.agents for each row execute function public.touch_updated_at();

-- ── seed tenants ────────────────────────────────────────────────────────────
insert into public.tenants (id, name, slug, plan, status, region, meta_business_id, billing_email, seats, accent) values
  ('t_aix','Air India Express','air-india-express','enterprise','active','IN','102938475610293','finops@airindiaexpress.in',25,'#E4572E'),
  ('t_bm','Brightmart Retail','brightmart','scale','active','IN','208374651029384','ap@brightmart.in',12,'#7C8CF8'),
  ('t_nt','Nexa Travel Group','nexa-travel','growth','trial','AE','301928374650192','ops@nexatravel.ae',6,'#3FBF8F')
on conflict (id) do nothing;
