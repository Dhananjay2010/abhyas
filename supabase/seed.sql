-- Abhyas — Development seed data
-- Deterministic test data for local development and testing.
-- This file creates a test user with realistic but clearly fake data.
--
-- IMPORTANT: This seed runs AFTER migrations, so all tables and reference data
-- (equipment, exercises, breathing patterns, etc.) already exist.
-- 
-- The test user's auth.users row must be created manually via Google OAuth
-- or the Supabase dashboard. This seed only populates the profile and activity data.
--
-- To reset and re-seed: npm run supabase:reset

-- ============================================================
-- TEST USER DATA
-- ============================================================
-- This uses a fixed UUID so the seed is deterministic and can be re-run.
-- The actual auth.users row must exist (created via signup or dashboard).
-- If you want to use this seed data, create a test user and replace this UUID
-- with the user's actual UUID from auth.users.

DO $$
DECLARE
  test_user_id uuid := '00000000-0000-0000-0000-000000000001';
  test_program_id uuid;
  test_program_day_id uuid;
  test_session_id uuid;
  test_session_exercise_id uuid;
BEGIN
  
  -- Only seed if the test user doesn't already have a profile
  -- (makes the seed idempotent and safe to re-run)
  IF EXISTS (SELECT 1 FROM profiles WHERE id = test_user_id) THEN
    RAISE NOTICE 'Test user profile already exists, skipping seed';
    RETURN;
  END IF;

  -- Profile: "Test User" — clearly fake
  INSERT INTO profiles (
    id,
    display_name,
    date_of_birth,
    sex,
    height_cm,
    weight_kg,
    level,
    goal,
    days_per_week,
    yoga_days_per_week,
    preferred_session_minutes,
    has_all_equipment,
    onboarding_completed_at,
    disclaimer_accepted_at,
    created_at
  ) VALUES (
    test_user_id,
    'Test User',
    '1990-01-01',
    'male',
    175,
    75.0,
    'intermediate',
    'muscle_gain',
    4,
    0,
    60,
    false,
    now() - interval '30 days',
    now() - interval '30 days',
    now() - interval '30 days'
  );

  -- User settings: defaults
  INSERT INTO user_settings (
    user_id,
    planning_mode,
    per_set_logging,
    resume_session,
    cooldown_enabled,
    rest_timer_sound,
    rest_timer_vibrate,
    rest_timer_autostart,
    bodyweight_prompt,
    theme
  ) VALUES (
    test_user_id,
    'progression',
    true,
    true,
    true,
    true,
    true,
    true,
    'weekly',
    'dark'
  );

  -- Equipment: home gym setup (barbell, dumbbells, bench, pull-up bar)
  INSERT INTO user_equipment (user_id, equipment_id, available)
  SELECT test_user_id, id, true
  FROM equipment
  WHERE id IN (
    'bodyweight',
    'barbell',
    'dumbbell',
    'pull_up_bar',
    'flat_bench',
    'adjustable_bench',
    'squat_rack',
    'resistance_band',
    'yoga_mat'
  );

  -- No injuries for the test user
  -- (uncomment to add a sample injury)
  -- INSERT INTO user_injuries (user_id, body_region, severity, note)
  -- VALUES (test_user_id, 'lower_back', 'past', 'Healed strain from 2024');

  -- Program: 4-day Upper/Lower split, block 1
  -- Started 3 weeks ago, so we're in week 3 of 4
  INSERT INTO programs (
    id,
    user_id,
    block_number,
    split_type,
    days_per_week,
    started_on,
    ends_on,
    deload_week,
    status
  ) VALUES (
    gen_random_uuid(),
    test_user_id,
    1,
    'upper_lower',
    4,
    current_date - interval '20 days',
    current_date + interval '8 days',
    4,
    'active'
  ) RETURNING id INTO test_program_id;

  -- Program days: Mon/Thu upper, Tue/Fri lower, rest days
  -- Day 1 (Monday): Upper
  INSERT INTO program_days (
    id,
    program_id,
    day_index,
    day_type,
    focus,
    label
  ) VALUES (
    gen_random_uuid(),
    test_program_id,
    1,
    'weights',
    'Chest, shoulders, triceps',
    'Upper A'
  ) RETURNING id INTO test_program_day_id;

  -- Add exercises for Upper A day
  -- (In production these come from the generator; here we hardcode a few)
  INSERT INTO program_day_exercises (
    program_day_id,
    exercise_id,
    order_index,
    target_sets,
    target_reps_min,
    target_reps_max,
    rest_seconds
  )
  SELECT
    test_program_day_id,
    e.id,
    row_number() OVER (ORDER BY e.slug),
    CASE 
      WHEN e.mechanic = 'compound' THEN 4
      ELSE 3
    END,
    8,
    12,
    90
  FROM exercises e
  WHERE e.slug IN (
    'barbell-bench-press',
    'overhead-press',
    'dumbbell-row',
    'tricep-dips',
    'lateral-raise'
  )
  LIMIT 5;

  -- Day 2 (Tuesday): Lower
  INSERT INTO program_days (
    program_id,
    day_index,
    day_type,
    focus,
    label
  ) VALUES (
    test_program_id,
    2,
    'weights',
    'Quads, glutes, hamstrings',
    'Lower A'
  );

  -- Days 3, 5, 6, 7: Rest or active recovery
  INSERT INTO program_days (program_id, day_index, day_type, label)
  VALUES
    (test_program_id, 3, 'rest', 'Rest'),
    (test_program_id, 5, 'rest', 'Rest'),
    (test_program_id, 6, 'rest', 'Rest'),
    (test_program_id, 7, 'rest', 'Rest');

  -- Day 4 (Thursday): Upper B
  INSERT INTO program_days (
    program_id,
    day_index,
    day_type,
    focus,
    label
  ) VALUES (
    test_program_id,
    4,
    'weights',
    'Back, biceps, rear delts',
    'Upper B'
  );

  -- Session: completed workout from 2 days ago
  INSERT INTO sessions (
    id,
    user_id,
    program_id,
    program_day_id,
    local_date,
    planned_type,
    actual_type,
    status,
    started_at,
    completed_at,
    duration_seconds,
    warmup_completed,
    cooldown_completed,
    energy_rating
  ) VALUES (
    gen_random_uuid(),
    test_user_id,
    test_program_id,
    test_program_day_id,
    current_date - interval '2 days',
    'weights',
    'weights',
    'completed',
    (current_date - interval '2 days')::timestamp + interval '10 hours',
    (current_date - interval '2 days')::timestamp + interval '11 hours',
    3600,
    true,
    true,
    4
  ) RETURNING id INTO test_session_id;

  -- Session exercise: Barbell bench press
  INSERT INTO session_exercises (
    id,
    session_id,
    exercise_id,
    order_index,
    planned_sets,
    planned_reps_min,
    planned_reps_max,
    planned_rest_seconds,
    metric,
    status,
    feel
  )
  SELECT
    gen_random_uuid(),
    test_session_id,
    e.id,
    1,
    4,
    8,
    12,
    90,
    'reps',
    'completed',
    'right'
  FROM exercises e
  WHERE e.slug = 'barbell-bench-press'
  LIMIT 1
  RETURNING id INTO test_session_exercise_id;

  -- Session sets: 4 sets of bench press with progression
  INSERT INTO session_sets (
    session_exercise_id,
    set_number,
    reps,
    weight_kg,
    is_warmup_set,
    completed_at
  ) VALUES
    (test_session_exercise_id, 1, 12, 60.0, false, (current_date - interval '2 days')::timestamp + interval '10 hours 15 minutes'),
    (test_session_exercise_id, 2, 11, 60.0, false, (current_date - interval '2 days')::timestamp + interval '10 hours 20 minutes'),
    (test_session_exercise_id, 3, 10, 60.0, false, (current_date - interval '2 days')::timestamp + interval '10 hours 25 minutes'),
    (test_session_exercise_id, 4, 10, 60.0, false, (current_date - interval '2 days')::timestamp + interval '10 hours 30 minutes');

  -- Exercise progress: working weights for a few key lifts
  INSERT INTO exercise_progress (
    user_id,
    exercise_id,
    current_working_weight_kg,
    current_target_reps,
    consecutive_failures,
    last_performed_on,
    best_weight_kg
  )
  SELECT
    test_user_id,
    e.id,
    CASE e.slug
      WHEN 'barbell-bench-press' THEN 60.0
      WHEN 'barbell-squat' THEN 80.0
      WHEN 'barbell-deadlift' THEN 100.0
      WHEN 'pull-up' THEN 0.0  -- bodyweight
      ELSE 20.0
    END,
    12,
    0,
    current_date - interval '2 days',
    CASE e.slug
      WHEN 'barbell-bench-press' THEN 65.0
      WHEN 'barbell-squat' THEN 85.0
      WHEN 'barbell-deadlift' THEN 105.0
      WHEN 'pull-up' THEN 0.0
      ELSE 22.5
    END
  FROM exercises e
  WHERE e.slug IN (
    'barbell-bench-press',
    'barbell-squat',
    'barbell-deadlift',
    'pull-up',
    'overhead-press',
    'barbell-row'
  );

  -- Body metrics: weekly weigh-ins
  INSERT INTO body_metrics (user_id, recorded_on, weight_kg)
  VALUES
    (test_user_id, current_date - interval '21 days', 77.0),
    (test_user_id, current_date - interval '14 days', 76.5),
    (test_user_id, current_date - interval '7 days', 76.0),
    (test_user_id, current_date, 75.5);

  RAISE NOTICE 'Test user seeded successfully with UUID: %', test_user_id;
  RAISE NOTICE 'To use this test data, create an auth.users row with this UUID';
  RAISE NOTICE 'or replace the UUID in this seed file with your test user''s actual UUID';

END $$;
