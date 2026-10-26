-- Gym domains and brand resolution for white-label hosting
-- Maps deployment hostnames to gyms for runtime branding.
-- Only verified mappings are returned; platform admin (service role) manages the table.

-- ============================================================
-- TABLE: gym_domains
-- ============================================================

create table if not exists public.gym_domains (
  host            text primary key,
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  verified        boolean not null default false,
  created_at      timestamptz not null default now(),
  
  -- Host must be lowercase (case-insensitive DNS)
  constraint gym_domains_host_lowercase check (host = lower(host)),
  
  -- Basic hostname format validation (domain or IP:port)
  -- Allows: example.com, sub.example.com, localhost:3000, 192.168.1.1:8080
  -- Blocks: trailing dots, spaces, invalid chars
  constraint gym_domains_host_format check (
    host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$'
  )
);

-- Index for gym_id lookups (e.g. listing all domains for a gym)
create index if not exists gym_domains_gym_id_idx on public.gym_domains(gym_id);

-- Enable RLS
alter table public.gym_domains enable row level security;

-- No client policies: only service role and postgres can write.
-- Reads go through the SECURITY DEFINER function below.

-- ============================================================
-- FUNCTION: resolve_gym_by_host
-- ============================================================

-- Map a deployment hostname to a gym for runtime branding.
-- Returns only VERIFIED mappings (unverified hosts return nothing).
-- SECURITY DEFINER bypasses RLS; clients can resolve any verified host.
create or replace function public.resolve_gym_by_host(p_host text)
returns table (
  gym_id uuid,
  gym_slug text,
  gym_name text
) language sql security definer
set search_path = ''
stable as $$
  -- Normalize: lowercase, strip trailing dot, strip :port
  with normalized as (
    select lower(
      regexp_replace(
        regexp_replace(trim(p_host), '\.$', ''),
        ':[0-9]+$', ''
      )
    ) as clean_host
  )
  select 
    g.id as gym_id,
    g.slug as gym_slug,
    g.name as gym_name
  from normalized n
  join public.gym_domains d on d.host = n.clean_host
  join public.gyms g on g.id = d.gym_id
  where d.verified = true
  limit 1;
$$;

-- Revoke from PUBLIC, grant to anon and authenticated
do $$
begin
  revoke execute on function public.resolve_gym_by_host(text) from public;
  grant execute on function public.resolve_gym_by_host(text) to anon, authenticated;
exception when undefined_function then
  null;
end $$;

-- ============================================================
-- FUNCTION: get_gym_brand
-- ============================================================

-- Return public brand fields for a gym (name, slug, timezone).
-- SECURITY DEFINER bypasses RLS so anon visitors on a gym's domain can see the brand.
-- A later migration (000038) will add logo/colors fields and extend this function.
create or replace function public.get_gym_brand(p_gym_id uuid)
returns table (
  name text,
  slug text,
  timezone text
) language sql security definer
set search_path = ''
stable as $$
  select 
    g.name,
    g.slug,
    g.timezone
  from public.gyms g
  where g.id = p_gym_id
  limit 1;
$$;

-- Revoke from PUBLIC, grant to anon and authenticated
do $$
begin
  revoke execute on function public.get_gym_brand(uuid) from public;
  grant execute on function public.get_gym_brand(uuid) to anon, authenticated;
exception when undefined_function then
  null;
end $$;
