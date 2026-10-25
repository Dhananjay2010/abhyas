-- Breathe, phase 3c: Kapalabhati, behind a safety confirmation.
--
-- Decision Q4 in BREATHE-SPEC.md; designed in section 16.3. Additive only.
--
-- Two new phase kinds arrive with it, and nothing existing uses them:
--
--   {"kind": "pump", "seconds": 20, "rate": 1, "cue": "..."}
--       n breaths a second for s seconds. One phase, not sixty: twenty pumps
--       as forty phases would pass the twenty-four a pattern may have, and the
--       app does not pace each pump anyway -- it sets a tempo and you follow.
--   {"kind": "rest", "seconds": 40, "cue": "..."}
--       breathe normally for s seconds. Not a hold: nothing is being held, and
--       the screen must not animate as though it were pacing you.

-- ============================================================
-- 1. THE PRACTICE
--
-- Twenty pumps a round at one a second, then forty seconds of normal
-- breathing, three rounds. That is more conservative than the sketch in 16.3
-- (thirty seconds of pumping at 1.5 a second): this is the one practice here
-- that can genuinely make someone faint, so it is seeded at a tempo a beginner
-- can hold and a rest long enough to notice how they feel before the next
-- round. Three rounds is three minutes in total.
-- ============================================================

insert into breathing_patterns
  (slug, name, subtitle, description, inhale_seconds, hold_in_seconds, exhale_seconds, hold_out_seconds,
   default_cycles, max_cycles, benefit, contraindications, level, sort_order, intents, phases, how_to, why) values

  ('kapalabhati', 'Kapalabhati', 'Skull-shining breath',
   'Short, sharp exhales through the nose with the belly. The breath in happens by itself.',
   0, 0, 1, 0, 3, 3,
   'Wakes you up. Warming, and clearing when the head feels dull.',
   'Not while pregnant, or with high blood pressure, a heart condition, epilepsy, glaucoma, a hernia, recent abdominal surgery, or on a full stomach. Stop at once if you feel dizzy or light-headed and breathe normally.',
   'expert', 11, '{energy}',
   '[
     {"kind": "pump", "seconds": 20, "rate": 1, "cue": "Sharp out through the nose", "label": "Pump"},
     {"kind": "rest", "seconds": 40, "cue": "Breathe normally", "label": "Rest"}
   ]'::jsonb,
   array[
     'Sit upright, somewhere you could stay for a few minutes. Do not do this lying down.',
     'Rest a hand on your belly. Breathe in to about half full.',
     'Pull the belly sharply in to push the air out through your nose. The breath in after it happens on its own — do not help it.',
     'Follow the screen: one pump a second, twenty a round.',
     'Between rounds, breathe normally and do nothing. That rest is part of the practice, not a gap in it.',
     'If you feel dizzy or tingly, stop. That is the signal to stop, not to push on.'
   ],
   'Every other practice here slows you down; this one does the opposite. The forceful exhales are driven by the belly while the in-breath stays passive, which is why it is taught as cleansing rather than calming. It is also the one practice here with a real list of people who should not do it, which is why it asks before the first time.')

on conflict (slug) do nothing;

-- ============================================================
-- 2. THE CONFIRMATION, ASKED ONCE
--
-- A column rather than a row per practice: there is one practice that needs
-- this, and inventing a table for it would be pretending otherwise. If a
-- second one ever arrives, this becomes a set.
-- ============================================================

alter table user_settings
  add column breathing_kapalabhati_ack boolean not null default false;

notify pgrst, 'reload schema';
