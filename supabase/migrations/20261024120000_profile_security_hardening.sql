-- M5: Profile security hardening — server-side enforcement
--
-- Two-layer defense:
-- 1. SECURITY DEFINER RPCs for disclaimer/onboarding (set timestamps server-side)
-- 2. DB constraints for age, height, numeric validity
-- 3. Column-level UPDATE grants (revoke then grant specific columns)
--
-- All constraints use NOT VALID (enforced on new writes only, existing rows grandfathered).
-- Idempotent: guarded with pg_constraint/pg_proc existence checks.

-- ============================================================
-- 1. SECURITY DEFINER RPC: accept_disclaimer()
-- ============================================================

create or replace function public.accept_disclaimer()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
begin
  caller_id := (select auth.uid());
  
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set disclaimer_accepted_at = now()
  where id = caller_id;
end;
$$;

revoke all on function public.accept_disclaimer() from public, anon;
grant execute on function public.accept_disclaimer() to authenticated;

comment on function public.accept_disclaimer() is
  'M5: Sets disclaimer_accepted_at to now() server-side. '
  'Client cannot set arbitrary timestamps.';

-- ============================================================
-- 2. SECURITY DEFINER RPC: complete_onboarding()
-- ============================================================

create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  profile_row record;
begin
  caller_id := (select auth.uid());
  
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Check prerequisites
  select * into profile_row
  from public.profiles
  where id = caller_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  if profile_row.disclaimer_accepted_at is null then
    raise exception 'Disclaimer must be accepted first';
  end if;

  if profile_row.date_of_birth is null then
    raise exception 'Date of birth is required';
  end if;

  if profile_row.height_cm is null then
    raise exception 'Height is required';
  end if;

  if profile_row.goal is null or profile_row.level is null 
     or profile_row.primary_track is null or profile_row.days_per_week is null then
    raise exception 'Goal, level, track, and days per week are required';
  end if;

  -- All prerequisites met, set completion timestamp
  update public.profiles
  set onboarding_completed_at = now()
  where id = caller_id;
end;
$$;

revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated;

comment on function public.complete_onboarding() is
  'M5: Sets onboarding_completed_at to now() after checking prerequisites. '
  'Enforces that disclaimer, DOB, height, goal, level, track, and days_per_week are set.';

-- ============================================================
-- 3. DB CONSTRAINTS (NOT VALID, idempotent)
-- ============================================================

-- Age constraint: date_of_birth must be at least 16 years before today
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_minimum_age_check'
    and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_minimum_age_check
      check (date_of_birth is null or date_of_birth <= current_date - interval '16 years')
      not valid;
  end if;
end $$;

-- Height constraint: P3-M5: must be finite and in range 100-250, or null
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_height_check'
    and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_height_check
      check (height_cm is null or (height_cm <> 'NaN'::numeric and height_cm between 100 and 250))
      not valid;
  end if;
end $$;

-- Days per week: 3-6 range
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_days_per_week_range'
    and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_days_per_week_range
      check (days_per_week is null or days_per_week between 3 and 6)
      not valid;
  end if;
end $$;

-- Yoga days: 0-6 and less than days_per_week
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_yoga_days_range'
    and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_yoga_days_range
      check (yoga_days_per_week between 0 and 6)
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_at_least_one_training_day'
    and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_at_least_one_training_day
      check (days_per_week is null or yoga_days_per_week < days_per_week)
      not valid;
  end if;
end $$;

-- ============================================================
-- 4. TIMEZONE VALIDATION TRIGGER
-- ============================================================

create or replace function public.validate_profile_timezone()
returns trigger
language plpgsql
as $$
begin
  -- Only validate if timezone actually changed
  if new.timezone is distinct from old.timezone then
    if new.timezone is null or trim(new.timezone) = '' then
      raise exception 'timezone cannot be null or empty';
    end if;
    
    -- Validate against pg_timezone_names instead of regex
    if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
      raise exception 'timezone "%" is not a valid IANA timezone', new.timezone;
    end if;
  end if;
  
  return new;
end;
$$;

drop trigger if exists profiles_validate_timezone on public.profiles;
create trigger profiles_validate_timezone
  before insert or update of timezone on public.profiles
  for each row
  execute function public.validate_profile_timezone();

-- ============================================================
-- 5. COLUMN-LEVEL UPDATE GRANTS
-- ============================================================

-- Revoke table-level UPDATE from authenticated
revoke update on public.profiles from authenticated;

-- Grant UPDATE only on columns that the app legitimately writes as the user
-- Checked callers: saveProfileFields (onboarding), updateProfileSettings (settings)
-- Allow-list union: goal, level, primary_track, days_per_week, yoga_days_per_week,
--                   preferred_session_minutes, has_all_equipment, units, display_name
-- Plus: date_of_birth, sex, height_cm (saveAboutYou)
-- Plus: timezone (if Settings exposes it in future; currently not written by client)
grant update (
  display_name,
  date_of_birth,
  sex,
  height_cm,
  level,
  goal,
  primary_track,
  days_per_week,
  yoga_days_per_week,
  preferred_session_minutes,
  has_all_equipment,
  units
) on public.profiles to authenticated;

-- Note: disclaimer_accepted_at and onboarding_completed_at are NOT in the grant list
-- They can only be set through the SECURITY DEFINER RPCs above

comment on constraint profiles_minimum_age_check on public.profiles is
  'M5: Enforces minimum age of 16 years. NOT VALID (grandfathers existing rows).';

comment on constraint profiles_height_check on public.profiles is
  'P3-M5: Prevents NaN and enforces height range 100-250. NOT VALID.';

comment on constraint profiles_days_per_week_range on public.profiles is
  'M5: Training days must be 3-6. NOT VALID.';

comment on constraint profiles_yoga_days_range on public.profiles is
  'M5: Yoga days must be 0-6. NOT VALID.';

comment on constraint profiles_at_least_one_training_day on public.profiles is
  'M5: At least one training day required (yoga cannot be all days). NOT VALID.';

comment on function public.validate_profile_timezone() is
  'M5: Validates timezone against pg_timezone_names. Only checks when changed.';
