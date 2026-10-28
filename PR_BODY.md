# feat(gym): migration 044 `provision_gym`, a one-call, idempotent way to provision a gym

## Summary
`supabase/migrations/20261025000044_provision_gym.sql` adds:

    public.provision_gym(p_name text, p_slug text, p_timezone text, p_owner_email text,
                         p_display_name text default null, p_primary_color text default null,
                         p_accent_color text default null, p_logo_url text default null)
      returns jsonb  -- {ok, created, gym_id, slug}

- **Security:**
  - SECURITY DEFINER, `set search_path = ''`, owned by postgres.
  - Revoked from public, anon and authenticated; executable only by service_role (and postgres).
- **Behaviour:**
  - Creates the gym and the owner's active `owner` membership.
  - A re-run with the same slug and the same owner returns `created:false`. It leaves name and timezone unchanged, and null branding parameters keep the existing branding (coalesce).
  - Other memberships are never touched. That includes the 035 default-gym member row and other gyms' owner rows.
  - Owning more than one gym is allowed.
- **Errors:**
  - `PGY01`: no user with that email. Ask them to sign up first.
  - `PGY03`: the slug exists with a different active owner.
  - `22023`: invalid timezone or slug.
  - `BRND2`, `BRND3`, `BRND4`, `BRND7`: branding validation, mirroring 040.

## Provisioning on prod (run as postgres; the owner must have signed up first)
    select public.provision_gym('Gym Name','gym-slug','Asia/Kolkata','<owner email>','Display Name','#RRGGBB','#RRGGBB',null);
`scripts/provision-gym.ts` (`npm run provision:gym`) wraps the same call and refuses prod URLs (URL guard).

## Tests
- **`test:provision-gym-real-db`** (REAL_DB-gated; a NO-OP by default and in the skip list): 20 scenarios, **112 ok / 0 FAIL** in CI (pending CI on new head).
- **`test:provision-gym-url-guard`:** a pure helper test, run in the default chain.
- **`ci:migration-044-idempotent`:** `✅ All migration 044 idempotency tests passed` (includes proowner check).
- **`ci:mutant-provision-gym`:** **14/14 killed, 0 survived, 0 skipped.**
  - A mutant counts as killed only when its exact check label FAILs.
  - The script exits 1 unless killed is 14 and skipped is 0.

| Mutant | Must fail label |
|---|---|
| (a) grant to authenticated | authenticated call returns error |
| (b) remove search_path | proconfig contains search_path="" |
| (c) security invoker | prosecdef is true |
| (d) drop unknown-email raise | error code is PGY01 |
| (e) drop slug idempotency | re-run same slug returns no error |
| (f) owner role becomes member | create returns no error |
| (g) skip timezone validation | invalid timezone error code is 22023 |
| (h) skip primary_color validation | error code is BRND2 |
| (i) skip accent_color validation | error code is BRND3 |
| (j) skip color pair rule | error code is BRND7 |
| (k) overwrite branding with null | display_name unchanged |
| (l) end other owner memberships | gym A membership unchanged |
| (m) drop PGY03 check | error code is PGY03 |
| (n) end default gym memberships | default membership byte-identical |

## CI
- New steps are only in the `database-seed-test` job:
  - `REAL_DB=1 npm run test:provision-gym-real-db`
  - `REAL_DB=1 npm run ci:migration-044-idempotent`
  - `REAL_DB=1 npm run ci:mutant-provision-gym`
- **CI steps outside the REAL_DB job: none.**

## Hygiene
- The test chain is main's chain unchanged, plus `test:provision-gym-url-guard` and `test:provision-gym-real-db`.
- `ci:*` scripts are CI-only.
- Dependencies and lockfile are identical to main.
- tsc is clean. eslint shows 0 errors and 116 warnings, the same as main at 661db7c6.
- No casts other than `as const`, no `any`, `!` or eslint-disable. No secrets; only @example.com test emails.

## Notes
- If an owner is also a member of the default gym, member-branding resolution can still choose default. That is #178's resolveBrand order, not this PR.
- If an owner owns more than one gym, main's `checkGymOwnership` (`.single()`) returns `isOwner:false` until #177's `pickOwnedGym` lands. Test 17 asserts checkGymOwnership for a single-owned gym.
