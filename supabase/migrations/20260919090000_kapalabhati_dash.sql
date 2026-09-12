-- Breathe: one literal "--" in Kapalabhati's how-to, the same slip the course
-- text had. Seen on the live setup screen, not in the file.
--
-- A correction rather than an edit to 20260916090000, because that insert ends
-- with `on conflict (slug) do nothing` and so would not touch the row that is
-- already there. The source migration is fixed as well, so a database created
-- from scratch never has it.

update breathing_patterns
   set how_to = array_replace(
         how_to,
         'Pull the belly sharply in to push the air out through your nose. The breath in after it happens on its own -- do not help it.',
         'Pull the belly sharply in to push the air out through your nose. The breath in after it happens on its own — do not help it.')
 where slug = 'kapalabhati';
