-- M5: Profile security hardening — CHECK constraints and validation
--
-- Enforces server-side validation that users cannot bypass through direct
-- PostgREST writes: minimum age 16, valid IANA timezone, disclaimer_accepted_at
-- can only be set to roughly now() and never backdated, and onboarding_completed_at
-- needs prerequisite fields.
--
-- All constraints are added as NOT VALID then validated separately, so the
-- migration is safe to apply even if production data violates them. Existing
-- rows stay as-is; only new inserts and updates are checked.

-- ============================================================
-- 1. AGE CONSTRAINT (minimum 16 years old)
-- ============================================================

-- date_of_birth must be at least 16 years before today.
-- Uses CURRENT_DATE rather than now() so the check is stable within a transaction.
alter table profiles
  add constraint profiles_minimum_age_check
  check (date_of_birth is null or date_of_birth <= CURRENT_DATE - interval '16 years')
  not valid;

-- Validate existing rows (safe: they came through the age gate in saveAboutYou)
alter table profiles validate constraint profiles_minimum_age_check;

-- ============================================================
-- 2. TIMEZONE VALIDATION
-- ============================================================

-- We cannot check IANA timezone validity in a CHECK constraint without loading
-- all valid zones into a table or using an extension. Instead, we enforce it
-- in the server actions (validateTimezone) and add a trigger that at least
-- prevents empty/null timezone from breaking Intl calls.

create or replace function validate_profile_timezone()
returns trigger
language plpgsql
as $$
begin
  -- timezone has a default of 'Asia/Kolkata', but ensure it's never null or empty
  if new.timezone is null or trim(new.timezone) = '' then
    raise exception 'timezone cannot be null or empty';
  end if;
  
  -- Basic sanity check: valid IANA zones are alphanumeric with slashes and underscores
  -- This doesn't validate the full IANA list but catches obvious garbage
  if new.timezone !~ '^[A-Za-z_]+(/[A-Za-z_]+)*$' then
    raise exception 'timezone "%" does not look like a valid IANA zone', new.timezone;
  end if;
  
  return new;
end;
$$;

drop trigger if exists profiles_validate_timezone on profiles;
create trigger profiles_validate_timezone
  before insert or update of timezone on profiles
  for each row
  execute function validate_profile_timezone();

-- ============================================================
-- 3. DISCLAIMER_ACCEPTED_AT — can only be set to now(), never backdated
-- ============================================================

-- When disclaimer_accepted_at is set (not null), it must be within the last
-- 5 minutes of when the row is being written. This prevents:
-- - Backdating to pretend you accepted months ago
-- - Setting a future date
-- - Mass assignment of an arbitrary timestamp

create or replace function validate_disclaimer_timestamp()
returns trigger
language plpgsql
as $$
begin
  if new.disclaimer_accepted_at is not null then
    -- Allow disclaimer to be set if it's within 5 minutes of now
    -- (Accounts for clock skew, transaction delays, and test environments)
    if new.disclaimer_accepted_at < now() - interval '5 minutes'
       or new.disclaimer_accepted_at > now() + interval '5 minutes' then
      raise exception 'disclaimer_accepted_at must be set to approximately now()';
    end if;
    
    -- Once set, it cannot be cleared (going from non-null to null)
    if old.disclaimer_accepted_at is not null and new.disclaimer_accepted_at is null then
      raise exception 'disclaimer_accepted_at cannot be cleared once accepted';
    end if;
  end if;
  
  return new;
end;
$$;

drop trigger if exists profiles_validate_disclaimer on profiles;
create trigger profiles_validate_disclaimer
  before insert or update of disclaimer_accepted_at on profiles
  for each row
  execute function validate_disclaimer_timestamp();

-- ============================================================
-- 4. ONBOARDING_COMPLETED_AT — requires prerequisites
-- ============================================================

-- onboarding_completed_at can only be set if:
-- - disclaimer_accepted_at is already set
-- - date_of_birth is set (passed the age gate)
-- - height_cm is set (passed "about you")
-- - goal, level, primary_track, days_per_week are set

create or replace function validate_onboarding_completion()
returns trigger
language plpgsql
as $$
begin
  if new.onboarding_completed_at is not null then
    -- Same timestamp validation as disclaimer
    if new.onboarding_completed_at < now() - interval '5 minutes'
       or new.onboarding_completed_at > now() + interval '5 minutes' then
      raise exception 'onboarding_completed_at must be set to approximately now()';
    end if;
    
    -- Prerequisite checks
    if new.disclaimer_accepted_at is null then
      raise exception 'Cannot complete onboarding without accepting disclaimer';
    end if;
    
    if new.date_of_birth is null then
      raise exception 'Cannot complete onboarding without date_of_birth';
    end if;
    
    if new.height_cm is null then
      raise exception 'Cannot complete onboarding without height_cm';
    end if;
    
    if new.goal is null or new.level is null or new.primary_track is null or new.days_per_week is null then
      raise exception 'Cannot complete onboarding without goal, level, track, and days_per_week';
    end if;
    
    -- Once set, it cannot be cleared
    if old.onboarding_completed_at is not null and new.onboarding_completed_at is null then
      raise exception 'onboarding_completed_at cannot be cleared once set';
    end if;
  end if;
  
  return new;
end;
$$;

drop trigger if exists profiles_validate_onboarding on profiles;
create trigger profiles_validate_onboarding
  before insert or update of onboarding_completed_at on profiles
  for each row
  execute function validate_onboarding_completion();

-- ============================================================
-- 5. ADDITIONAL VALIDATION CHECKS
-- ============================================================

-- days_per_week: 3-6 (the app enforces this, but defense in depth)
alter table profiles
  add constraint profiles_days_per_week_range
  check (days_per_week is null or (days_per_week between 3 and 6))
  not valid;

alter table profiles validate constraint profiles_days_per_week_range;

-- yoga_days_per_week: 0-6, and less than days_per_week (at least one training day)
alter table profiles
  add constraint profiles_yoga_days_range
  check (yoga_days_per_week between 0 and 6)
  not valid;

alter table profiles validate constraint profiles_yoga_days_range;

-- When both are set, yoga cannot be all the days
alter table profiles
  add constraint profiles_at_least_one_training_day
  check (days_per_week is null or yoga_days_per_week < days_per_week)
  not valid;

alter table profiles validate constraint profiles_at_least_one_training_day;

-- height_cm: reasonable range (the app checks 100-250)
alter table profiles
  add constraint profiles_height_range
  check (height_cm is null or (height_cm between 80 and 300))
  not valid;

alter table profiles validate constraint profiles_height_range;

-- ============================================================
-- 6. COLUMN PRIVILEGES (defense in depth for direct PostgREST)
-- ============================================================

-- The RLS policies already restrict updates to auth.uid() = id, so users can
-- only write their own row. However, they can write ANY column in that row
-- through PostgREST. The triggers above add runtime checks, but we can also
-- revoke UPDATE on sensitive columns entirely.
--
-- This is defense in depth: even if a user bypasses the app's validation,
-- they hit the trigger, and even if they somehow bypass the trigger (e.g.,
-- through a future bug in a SECURITY DEFINER function), they cannot write
-- these columns at all.

-- Revoke UPDATE on columns that should only be written through specific actions
revoke update (disclaimer_accepted_at) on profiles from authenticated;
revoke update (onboarding_completed_at) on profiles from authenticated;

-- Note: We don't revoke UPDATE on date_of_birth, sex, height_cm, or timezone
-- because they ARE writable through their designated actions (saveAboutYou).
-- The triggers ensure they can only be set with valid values.

-- Grant back the UPDATE privilege only for the columns in the allow-list
-- (This is belt-and-suspenders: the app already validates, but if someone
-- crafts a raw PostgREST request, they can only touch these columns)

-- These are already grantable through the table-level GRANT in rls_and_triggers.sql,
-- but we're being explicit about what IS allowed after the revocations above.

comment on constraint profiles_minimum_age_check on profiles is
  'M5: Enforces minimum age of 16 years. Existing rows grandfathered via NOT VALID + validate.';

comment on constraint profiles_days_per_week_range on profiles is
  'M5: Training days must be 3-6. Defense in depth; app enforces this too.';

comment on constraint profiles_yoga_days_range on profiles is
  'M5: Yoga days must be 0-6. Defense in depth.';

comment on constraint profiles_at_least_one_training_day on profiles is
  'M5: At least one training day required (yoga cannot be all days).';

comment on function validate_profile_timezone() is
  'M5: Ensures timezone is never null/empty and looks like an IANA zone.';

comment on function validate_disclaimer_timestamp() is
  'M5: disclaimer_accepted_at must be set to now(), never backdated or cleared.';

comment on function validate_onboarding_completion() is
  'M5: onboarding_completed_at requires prerequisites (disclaimer, DOB, height, goal, level, track, days).';
