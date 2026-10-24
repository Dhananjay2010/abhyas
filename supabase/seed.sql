-- Abhyas — Development seed data
-- Deterministic test data for local development and testing.
-- This file creates a test user with realistic but clearly fake data.
--
-- IMPORTANT: This seed runs AFTER migrations, so all tables and reference data
-- (equipment, exercises, breathing patterns, etc.) already exist.
-- 
-- The seed creates a local test auth user (test@example.com / password: testpass123)
-- that can sign in via email/password if local Supabase allows it.
--
-- To reset and re-seed: npm run supabase:reset

-- ============================================================
-- TEST AUTH USER
-- ============================================================
-- Create a deterministic test user in auth.users with email/password.
-- Fixed UUID so the seed is idempotent and deterministic.

DO $$
DECLARE
  test_user_id uuid := '00000000-0000-0000-0000-000000000001';
  test_email text := 'test@example.com';
  test_password text := 'testpass123';
  encrypted_password text;
  test_program_id uuid;
  test_program_day_id uuid;
  test_session_id uuid;
  test_session_exercise_id uuid;
BEGIN
  
  -- Only seed if the test user doesn't already exist
  -- (makes the seed idempotent and safe to re-run)
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = test_user_id) THEN
    RAISE NOTICE 'Test user already exists (id: %), skipping seed', test_user_id;
    RETURN;
  END IF;

  -- Create auth.users row with encrypted password
  -- Using pgcrypto's crypt() with bcrypt (bf) and cost factor 10
  encrypted_password := crypt(test_password, gen_salt('bf', 10));
  
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) VALUES (
    test_user_id,
    '00000000-0000-0000-0000-000000000000', -- Default instance for local dev
    test_email,
    encrypted_password,
    now(), -- Email already confirmed
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Test User"}'::jsonb,
    'authenticated',
    'authenticated',
    '',
    '',
    '',
    ''
  );

  -- Create auth.identities row for email provider
  INSERT INTO auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    test_user_id,
    test_user_id::text,
    test_user_id,
    jsonb_build_object(
      'sub', test_user_id::text,
      'email', test_email,
      'email_verified', true
    ),
    'email',
    now(),
    now(),
    now()
  );

  RAISE NOTICE 'Created test auth user: %', test_email;

  -- handle_new_user trigger auto-creates profiles and user_settings.
  -- Update them with test-specific values using ON CONFLICT.
  INSERT INTO profiles (
    id,
    display_name,
    date_of_birth,
    sex,
    height_cm,
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
    'intermediate',
    'muscle_gain',
    4,
    0,
    60,
    false,
    now() - interval '30 days',
    now() - interval '30 days',
    now() - interval '30 days'
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    date_of_birth = EXCLUDED.date_of_birth,
    sex = EXCLUDED.sex,
    height_cm = EXCLUDED.height_cm,
    level = EXCLUDED.level,
    goal = EXCLUDED.goal,
    days_per_week = EXCLUDED.days_per_week,
    yoga_days_per_week = EXCLUDED.yoga_days_per_week,
    preferred_session_minutes = EXCLUDED.preferred_session_minutes,
    has_all_equipment = EXCLUDED.has_all_equipment,
    onboarding_completed_at = EXCLUDED.onboarding_completed_at,
    disclaimer_accepted_at = EXCLUDED.disclaimer_accepted_at;

  -- user_settings is also auto-created by handle_new_user with defaults.
  -- No need to update it; the defaults are fine for testing.

  -- Equipment: home gym setup (barbell, dumbbells, bench, pull-up bar)
  INSERT INTO user_equipment (user_id, equipment_id)
  SELECT test_user_id, id
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
  -- Chest, shoulders, triceps focus
  -- (In production these come from the generator; here we hardcode coach-recognisable staples)
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
    ROW_NUMBER() OVER (),
    CASE e.slug
      WHEN 'barbell-bench-press-medium-grip' THEN 4
      WHEN 'barbell-shoulder-press' THEN 4
      WHEN 'dips-triceps-version' THEN 3
      WHEN 'cable-seated-lateral-raise' THEN 3
      WHEN 'cable-rope-overhead-triceps-extension' THEN 3
    END,
    CASE e.slug
      WHEN 'barbell-bench-press-medium-grip' THEN 6
      WHEN 'barbell-shoulder-press' THEN 6
      WHEN 'dips-triceps-version' THEN 8
      WHEN 'cable-seated-lateral-raise' THEN 10
      WHEN 'cable-rope-overhead-triceps-extension' THEN 10
    END,
    CASE e.slug
      WHEN 'barbell-bench-press-medium-grip' THEN 8
      WHEN 'barbell-shoulder-press' THEN 8
      WHEN 'dips-triceps-version' THEN 12
      WHEN 'cable-seated-lateral-raise' THEN 15
      WHEN 'cable-rope-overhead-triceps-extension' THEN 15
    END,
    CASE e.slug
      WHEN 'barbell-bench-press-medium-grip' THEN 180
      WHEN 'barbell-shoulder-press' THEN 120
      WHEN 'dips-triceps-version' THEN 90
      WHEN 'cable-seated-lateral-raise' THEN 60
      WHEN 'cable-rope-overhead-triceps-extension' THEN 60
    END
  FROM exercises e
  WHERE e.slug IN (
    'barbell-bench-press-medium-grip',
    'barbell-shoulder-press',
    'dips-triceps-version',
    'cable-seated-lateral-raise',
    'cable-rope-overhead-triceps-extension'
  );
  
  -- Fail loudly if any Upper A exercise slug is missing
  IF (SELECT COUNT(*) FROM program_day_exercises WHERE program_day_id = test_program_day_id) < 5 THEN
    RAISE EXCEPTION 'Upper A: Expected 5 exercises but found %. Check exercise slugs in seed.sql', 
      (SELECT COUNT(*) FROM program_day_exercises WHERE program_day_id = test_program_day_id);
  END IF;

  -- Day 2 (Tuesday): Lower A
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
    2,
    'weights',
    'Quads, glutes, hamstrings',
    'Lower A'
  ) RETURNING id INTO test_program_day_id;
  
  -- Add exercises for Lower A day
  -- Quads, glutes, hamstrings focus
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
    ROW_NUMBER() OVER (),
    CASE e.slug
      WHEN 'barbell-squat' THEN 4
      WHEN 'romanian-deadlift' THEN 4
      WHEN 'leg-press' THEN 3
      WHEN 'lying-leg-curls' THEN 3
      WHEN 'standing-calf-raises' THEN 3
    END,
    CASE e.slug
      WHEN 'barbell-squat' THEN 6
      WHEN 'romanian-deadlift' THEN 6
      WHEN 'leg-press' THEN 8
      WHEN 'lying-leg-curls' THEN 10
      WHEN 'standing-calf-raises' THEN 12
    END,
    CASE e.slug
      WHEN 'barbell-squat' THEN 8
      WHEN 'romanian-deadlift' THEN 8
      WHEN 'leg-press' THEN 12
      WHEN 'lying-leg-curls' THEN 15
      WHEN 'standing-calf-raises' THEN 15
    END,
    CASE e.slug
      WHEN 'barbell-squat' THEN 180
      WHEN 'romanian-deadlift' THEN 120
      WHEN 'leg-press' THEN 120
      WHEN 'lying-leg-curls' THEN 60
      WHEN 'standing-calf-raises' THEN 60
    END
  FROM exercises e
  WHERE e.slug IN (
    'barbell-squat',
    'romanian-deadlift',
    'leg-press',
    'lying-leg-curls',
    'standing-calf-raises'
  );
  
  -- Fail loudly if any Lower A exercise slug is missing
  IF (SELECT COUNT(*) FROM program_day_exercises WHERE program_day_id = test_program_day_id) < 5 THEN
    RAISE EXCEPTION 'Lower A: Expected 5 exercises but found %. Check exercise slugs in seed.sql', 
      (SELECT COUNT(*) FROM program_day_exercises WHERE program_day_id = test_program_day_id);
  END IF;

  -- Day 3: Rest
  INSERT INTO program_days (program_id, day_index, day_type, label)
  VALUES (test_program_id, 3, 'rest', 'Rest');
  
  -- Day 5 (Friday): Lower B
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
    5,
    'weights',
    'Posterior chain, quads',
    'Lower B'
  ) RETURNING id INTO test_program_day_id;
  
  -- Add exercises for Lower B day
  -- Posterior chain, quads focus
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
    ROW_NUMBER() OVER (),
    CASE e.slug
      WHEN 'barbell-deadlift' THEN 4
      WHEN 'front-barbell-squat' THEN 4
      WHEN 'dumbbell-lunges' THEN 3
      WHEN 'leg-extensions' THEN 3
      WHEN 'seated-calf-raise' THEN 3
    END,
    CASE e.slug
      WHEN 'barbell-deadlift' THEN 4
      WHEN 'front-barbell-squat' THEN 6
      WHEN 'dumbbell-lunges' THEN 8
      WHEN 'leg-extensions' THEN 10
      WHEN 'seated-calf-raise' THEN 12
    END,
    CASE e.slug
      WHEN 'barbell-deadlift' THEN 6
      WHEN 'front-barbell-squat' THEN 8
      WHEN 'dumbbell-lunges' THEN 12
      WHEN 'leg-extensions' THEN 15
      WHEN 'seated-calf-raise' THEN 15
    END,
    CASE e.slug
      WHEN 'barbell-deadlift' THEN 180
      WHEN 'front-barbell-squat' THEN 180
      WHEN 'dumbbell-lunges' THEN 90
      WHEN 'leg-extensions' THEN 60
      WHEN 'seated-calf-raise' THEN 60
    END
  FROM exercises e
  WHERE e.slug IN (
    'barbell-deadlift',
    'front-barbell-squat',
    'dumbbell-lunges',
    'leg-extensions',
    'seated-calf-raise'
  );
  
  -- Fail loudly if any Lower B exercise slug is missing
  IF (SELECT COUNT(*) FROM program_day_exercises WHERE program_day_id = test_program_day_id) < 5 THEN
    RAISE EXCEPTION 'Lower B: Expected 5 exercises but found %. Check exercise slugs in seed.sql', 
      (SELECT COUNT(*) FROM program_day_exercises WHERE program_day_id = test_program_day_id);
  END IF;
  
  -- Days 6, 7: Rest
  INSERT INTO program_days (program_id, day_index, day_type, label)
  VALUES
    (test_program_id, 6, 'rest', 'Rest'),
    (test_program_id, 7, 'rest', 'Rest');

  -- Day 4 (Thursday): Upper B
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
    4,
    'weights',
    'Back, biceps, rear delts',
    'Upper B'
  ) RETURNING id INTO test_program_day_id;
  
  -- Add exercises for Upper B day
  -- Back, biceps, rear delts focus
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
    ROW_NUMBER() OVER (),
    CASE e.slug
      WHEN 'bent-over-barbell-row' THEN 4
      WHEN 'pullups' THEN 4
      WHEN 'dumbbell-lying-rear-lateral-raise' THEN 3
      WHEN 'barbell-curl' THEN 3
      WHEN 'face-pull' THEN 3
    END,
    CASE e.slug
      WHEN 'bent-over-barbell-row' THEN 6
      WHEN 'pullups' THEN 6
      WHEN 'dumbbell-lying-rear-lateral-raise' THEN 10
      WHEN 'barbell-curl' THEN 8
      WHEN 'face-pull' THEN 10
    END,
    CASE e.slug
      WHEN 'bent-over-barbell-row' THEN 8
      WHEN 'pullups' THEN 8
      WHEN 'dumbbell-lying-rear-lateral-raise' THEN 15
      WHEN 'barbell-curl' THEN 12
      WHEN 'face-pull' THEN 15
    END,
    CASE e.slug
      WHEN 'bent-over-barbell-row' THEN 120
      WHEN 'pullups' THEN 180
      WHEN 'dumbbell-lying-rear-lateral-raise' THEN 60
      WHEN 'barbell-curl' THEN 90
      WHEN 'face-pull' THEN 60
    END
  FROM exercises e
  WHERE e.slug IN (
    'bent-over-barbell-row',
    'pullups',
    'dumbbell-lying-rear-lateral-raise',
    'barbell-curl',
    'face-pull'
  );
  
  -- Fail loudly if any Upper B exercise slug is missing
  IF (SELECT COUNT(*) FROM program_day_exercises WHERE program_day_id = test_program_day_id) < 5 THEN
    RAISE EXCEPTION 'Upper B: Expected 5 exercises but found %. Check exercise slugs in seed.sql', 
      (SELECT COUNT(*) FROM program_day_exercises WHERE program_day_id = test_program_day_id);
  END IF;

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
    rest_seconds,
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
  WHERE e.slug = 'barbell-bench-press-medium-grip'
  LIMIT 1
  RETURNING id INTO test_session_exercise_id;
  
  -- Fail loudly if bench press slug not found
  IF test_session_exercise_id IS NULL THEN
    RAISE EXCEPTION 'Session exercise not created: barbell-bench-press-medium-grip slug not found in exercises table';
  END IF;

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
      WHEN 'barbell-bench-press-medium-grip' THEN 60.0
      WHEN 'barbell-squat' THEN 80.0
      WHEN 'barbell-deadlift' THEN 100.0
      WHEN 'pullups' THEN 0.0  -- bodyweight
      WHEN 'barbell-shoulder-press' THEN 40.0
      WHEN 'bent-over-barbell-row' THEN 65.0
    END,
    12,
    0,
    current_date - interval '2 days',
    CASE e.slug
      WHEN 'barbell-bench-press-medium-grip' THEN 65.0
      WHEN 'barbell-squat' THEN 85.0
      WHEN 'barbell-deadlift' THEN 105.0
      WHEN 'pullups' THEN 0.0
      WHEN 'barbell-shoulder-press' THEN 42.5
      WHEN 'bent-over-barbell-row' THEN 70.0
    END
  FROM exercises e
  WHERE e.slug IN (
    'barbell-bench-press-medium-grip',
    'barbell-squat',
    'barbell-deadlift',
    'pullups',
    'barbell-shoulder-press',
    'bent-over-barbell-row'
  );
  
  -- Fail loudly if any exercise_progress slug is missing
  IF (SELECT COUNT(*) FROM exercise_progress WHERE user_id = test_user_id) < 6 THEN
    RAISE EXCEPTION 'Exercise progress: Expected 6 exercises but found %. Check exercise slugs in seed.sql', 
      (SELECT COUNT(*) FROM exercise_progress WHERE user_id = test_user_id);
  END IF;

  -- Body metrics: weekly weigh-ins
  INSERT INTO body_metrics (user_id, recorded_on, weight_kg)
  VALUES
    (test_user_id, current_date - interval '21 days', 77.0),
    (test_user_id, current_date - interval '14 days', 76.5),
    (test_user_id, current_date - interval '7 days', 76.0),
    (test_user_id, current_date, 75.5);

  RAISE NOTICE 'Test user seeded successfully: %', test_email;

END $$;
