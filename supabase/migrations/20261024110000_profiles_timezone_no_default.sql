-- Remove default and NOT NULL constraint from profiles.timezone
--
-- CONTEXT: The column defaulted to 'Asia/Kolkata', making it impossible to
-- distinguish between "user explicitly chose Kolkata" and "never set, use gym
-- or browser timezone". This broke per-gym white-label deployments where an
-- Indian user at a non-Indian gym would get the gym timezone instead of their
-- actual timezone.
--
-- CHANGE: Drop the default and allow NULL. New users get NULL, which the
-- application resolves as: user preference → gym brand timezone → browser
-- timezone → fallback. Existing rows keep their current values; a stored
-- 'Asia/Kolkata' is now a real preference.
--
-- SAFETY: Idempotent. Reading code already handles NULL timezone (falls back
-- to resolution logic). No function or trigger explicitly inserts
-- 'Asia/Kolkata' (handle_new_user() only sets id/display_name/avatar_url).

-- Drop the default value (safe to run multiple times)
alter table public.profiles 
  alter column timezone drop default;

-- Drop the NOT NULL constraint (safe to run multiple times; fails silently if already nullable)
alter table public.profiles 
  alter column timezone drop not null;

-- Update comment
comment on column public.profiles.timezone is
  'IANA timezone name (e.g., "America/New_York", "Asia/Tokyo"). '
  'NULL means "not set" and the application falls back to: '
  'gym brand timezone → browser-detected timezone → system fallback. '
  'Previously defaulted to "Asia/Kolkata"; existing rows with that value '
  'are now treated as an explicit user choice, not "unset".';
