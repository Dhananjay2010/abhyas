-- Breathe, phase 3d: four literal "--" in the course's seeded text.
--
-- Caught by reading the live page rather than the file: every other piece of
-- seeded content in this app uses a real em dash, so "left you calmest -- your
-- evidence" read as a typo next to it.
--
-- A correction rather than an edit to 20260918090000, because that insert ends
-- with `on conflict (slug) do nothing` and so would not touch the row that is
-- already there. The source migration is fixed as well, so a database created
-- from scratch never has this.

update breathing_journeys
   set about = replace(about, ' -- ', ' — '),
       days  = replace(days::text, ' -- ', ' — ')::jsonb
 where slug = 'foundations'
   and (about like '% -- %' or days::text like '% -- %');
