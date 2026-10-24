-- Add constraint to units column in profiles
-- The column already exists; this migration only adds validation.
-- Imperial units support, foundation layer.

alter table profiles
  add constraint profiles_units_check
  check (units in ('metric', 'imperial'));
