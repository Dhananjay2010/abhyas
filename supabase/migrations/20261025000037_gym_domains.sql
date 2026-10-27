-- Gym domains and brand resolution for white-label hosting
-- Maps deployment hostnames to gyms for runtime branding.
-- Only verified mappings are returned; platform admin (service role) manages the table.

-- ============================================================
-- TABLE: gym_domains
-- ============================================================

-- Create table first
create table if not exists public.gym_domains (
  host            text primary key,
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  verified        boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Clean up any existing rows that violate the new stricter format
-- (for DBs that ran Round 1's migration 037)
do $$
declare
  bad_row record;
begin
  -- Only run cleanup if table exists and has data
  if exists (select from information_schema.tables where table_schema = 'public' and table_name = 'gym_domains') then
    -- Log and delete rows that violate the new format
    for bad_row in
      select host, gym_id
      from public.gym_domains
      where 
        -- Not lowercase
        host <> lower(host)
        -- Or has port/scheme/path/trailing dot
        or host ~ '(^https?://|:[0-9]+$|/$|\.$)'
        -- Or exceeds length limits (253 total, 63 per label)
        or char_length(host) > 253
        or host ~ '[a-z0-9-]{64,}'
        -- Or invalid format (leading dot, consecutive dots, starts/ends with hyphen)
        or not (host ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$')
    loop
      raise notice 'Deleting invalid gym_domains row: host=%, gym_id=%', bad_row.host, bad_row.gym_id;
      delete from public.gym_domains where host = bad_row.host;
    end loop;
  end if;
end $$;

-- Drop old constraints if they exist (idempotent for re-running migration)
alter table public.gym_domains drop constraint if exists gym_domains_host_lowercase;
alter table public.gym_domains drop constraint if exists gym_domains_host_format;

-- Add strict constraints
-- Host must be lowercase (case-insensitive DNS)
alter table public.gym_domains add constraint gym_domains_host_lowercase 
  check (host = lower(host));

-- Host must be a bare hostname with length limits:
-- - Total length <= 253 chars (DNS maximum)
-- - Each label <= 63 chars (DNS maximum per label)
-- - No scheme, no port, no path, no trailing dot
-- - Each label: starts and ends with alphanumeric, hyphens only in middle
-- Allows: example.com, sub.example.com, multi.level.sub.example.com
-- Blocks: https://example.com, example.com:3000, example.com/, example.com.
-- Blocks: .example.com (leading dot), example..com (consecutive dots)
-- Blocks: -example.com, example-.com (labels starting/ending with hyphen)
-- Blocks: a 64-char label, a 254-char host
alter table public.gym_domains add constraint gym_domains_host_format 
  check (
    char_length(host) <= 253
    and host ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
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
  -- The stored host is already bare (no port/scheme/path), so we normalize the input
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
