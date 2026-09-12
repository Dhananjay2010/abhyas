-- Breathe, phase 3b: a signature shape per practice.
--
-- BREATHE-SPEC.md section 16.2. Additive, and everything keeps working without
-- it: the column defaults to 'orb', which is the circle every practice has
-- drawn until now, so a practice of your own and anything unrecognised is
-- unchanged.
--
-- The shape is content, not code: a pattern seeded later can declare its own
-- without touching the player.

alter table breathing_patterns
  add column shape text not null default 'orb'
    check (shape in ('orb', 'square', 'lobes', 'teardrop', 'ripple', 'pulse'));

-- Each practice gets the shape that matches what it actually is.
--
--   square    four equal sides, traced one side per phase
--   lobes     two lobes, the open nostril lit
--   teardrop  weighted to the exhale, for the two with a long one
--   ripple    rings spreading outward, for the hum
--   pulse     a flash on every pump
--   orb       the circle, for the smooth even ones
update breathing_patterns set shape = 'square'   where slug = 'box-breathing';
update breathing_patterns set shape = 'teardrop' where slug in ('four-seven-eight', 'physiological-sigh');
update breathing_patterns set shape = 'lobes'    where slug in ('nadi-shodhana', 'anulom-vilom');
update breathing_patterns set shape = 'ripple'   where slug = 'bhramari';
update breathing_patterns set shape = 'pulse'    where slug = 'kapalabhati';
-- coherent-breathing, extended-exhale, ujjayi and sheetali keep the orb: they
-- are the smooth, even practices, and the circle is what that looks like.

notify pgrst, 'reload schema';
