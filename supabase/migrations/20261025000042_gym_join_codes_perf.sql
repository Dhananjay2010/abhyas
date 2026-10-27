-- Performance improvements for gym_join_codes (Supabase advisor suggestions)
-- 1. Merge owner and staff SELECT policies into one permissive policy
-- 2. Add index on created_by (FK column)

-- ============================================================
-- POLICY OPTIMIZATION: Merge SELECT policies
-- ============================================================

-- Drop the old separate policies
do $$
begin
  drop policy if exists gym_join_codes_owner_select on public.gym_join_codes;
  drop policy if exists gym_join_codes_staff_select on public.gym_join_codes;
end $$;

-- Create the merged permissive policy
-- Allows: owner of the gym OR staff of the gym (staff can only see member codes)
-- Wrapped helper calls with (select ...) for initplan fix
do $$
begin
  drop policy if exists gym_join_codes_select on public.gym_join_codes;
  create policy gym_join_codes_select on public.gym_join_codes
    for select to authenticated
    using (
      (select public.is_gym_owner(gym_id)) or 
      ((select public.is_gym_staff(gym_id)) and role = 'member')
    );
end $$;

-- ============================================================
-- INDEX: Add index on created_by (FK column)
-- ============================================================

create index if not exists gym_join_codes_created_by_idx on public.gym_join_codes (created_by);
