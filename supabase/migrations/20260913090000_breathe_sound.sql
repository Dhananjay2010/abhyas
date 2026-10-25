-- Breathe, phase 2a: more ways to be guided by sound.
--
-- Additive, and the phase 1 app keeps working against it: 'tones' and 'off'
-- stay valid guidance values, and every new column has a default.
--
-- Guidance is now one of:
--   tones   a glide that rises and falls with the breath (phase 1)
--   ocean   a wave that swells as you breathe in and ebbs as you breathe out
--   voice   the phone speaking each cue, in English or Hindi
--   off
--
-- Ambience plays underneath any of them, at its own volume.

alter table user_settings
  drop constraint user_settings_breathing_guidance_check,
  add constraint user_settings_breathing_guidance_check
    check (breathing_guidance in ('tones', 'ocean', 'voice', 'off')),
  add column breathing_ambience text not null default 'none'
    check (breathing_ambience in ('none', 'rain', 'waves', 'brown', 'tanpura')),
  add column breathing_ambience_volume smallint not null default 40
    check (breathing_ambience_volume between 0 and 100),
  add column breathing_voice_lang text not null default 'en'
    check (breathing_voice_lang in ('en', 'hi'));

alter table breathing_logs
  drop constraint breathing_logs_guidance_check,
  add constraint breathing_logs_guidance_check
    check (guidance in ('tones', 'ocean', 'voice', 'off'));

-- A phase may now carry "hum": true. Bhramari's exhale is a hum, and the
-- player gives it a quiet drone to match pitch with rather than a glide that
-- would fight the voice.
update breathing_patterns set phases = '[
    {"kind": "inhale", "seconds": 4, "cue": "Breathe in through your nose"},
    {"kind": "exhale", "seconds": 8, "cue": "Hum, mmmm", "label": "Hum", "hum": true}
  ]'::jsonb
where slug = 'bhramari';

notify pgrst, 'reload schema';
