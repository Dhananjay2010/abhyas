-- Add constraint to units column in profiles
-- The column already exists; this migration normalizes existing data and adds validation.
-- Imperial units support, foundation layer.

-- First, ensure the column is NOT NULL with a default
alter table profiles
  alter column units set default 'metric';

alter table profiles
  alter column units set not null;

-- Normalize existing data before adding the constraint
update profiles
set units = case
  when lower(trim(units)) = 'kg' then 'metric'
  when lower(trim(units)) in ('lb', 'lbs', 'pounds') then 'imperial'
  when lower(trim(units)) in ('metric', 'imperial') then lower(trim(units))
  else 'metric'
end
where units is null
   or lower(trim(units)) not in ('metric', 'imperial');

-- Drop constraint if it already exists (idempotent)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_units_check'
      and conrelid = 'profiles'::regclass
  ) then
    alter table profiles drop constraint profiles_units_check;
  end if;
end $$;

-- Add the constraint
alter table profiles
  add constraint profiles_units_check
  check (units in ('metric', 'imperial'));
