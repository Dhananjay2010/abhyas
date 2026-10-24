-- Add CHECK constraints for height_cm and weight_kg to prevent NaN and out-of-range values
-- Postgres numeric type can store 'NaN', which orders above all numbers.
-- These constraints reject NaN and enforce realistic ranges.

-- ============================================================
-- profiles.height_cm: 100 to 250 cm
-- ============================================================

-- First, null out or normalize bad existing values (NaN or out of range)
update profiles
set height_cm = null
where height_cm is not null
  and (
    height_cm::text = 'NaN'
    or not (height_cm between 100 and 250)
  );

-- Drop constraint if it already exists (idempotent)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_height_cm_check'
      and conrelid = 'profiles'::regclass
  ) then
    alter table profiles drop constraint profiles_height_cm_check;
  end if;
end $$;

-- Add the constraint
-- Postgres numeric 'NaN' is greater than all numbers, so `between` rejects it
alter table profiles
  add constraint profiles_height_cm_check
  check (height_cm is null or (height_cm between 100 and 250));

-- ============================================================
-- body_metrics.weight_kg: 20 to 500 kg
-- ============================================================

-- First, null out or normalize bad existing values (NaN or out of range)
-- body_metrics.weight_kg is NOT NULL, so we delete rows with bad values
-- rather than nulling them out
delete from body_metrics
where weight_kg::text = 'NaN'
   or not (weight_kg between 20 and 500);

-- Drop constraint if it already exists (idempotent)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'body_metrics_weight_kg_check'
      and conrelid = 'body_metrics'::regclass
  ) then
    alter table body_metrics drop constraint body_metrics_weight_kg_check;
  end if;
end $$;

-- Add the constraint
-- body_metrics.weight_kg is NOT NULL, so we only need to check the range
alter table body_metrics
  add constraint body_metrics_weight_kg_check
  check (weight_kg between 20 and 500);
