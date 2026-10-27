-- Gym join codes: remove direct INSERT/UPDATE policies
-- All writes must go through create_join_code and revoke_join_code RPCs
-- This ensures proper validation and prevents direct manipulation

-- Drop the INSERT and UPDATE policies on gym_join_codes
do $$
begin
  drop policy if exists gym_join_codes_owner_insert on public.gym_join_codes;
  drop policy if exists gym_join_codes_owner_update on public.gym_join_codes;
end $$;

-- SELECT policies remain unchanged for owners and staff
