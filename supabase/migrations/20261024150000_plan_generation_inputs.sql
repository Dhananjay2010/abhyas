-- Add generation_inputs column to store snapshot of plan generation parameters
-- This allows detecting when settings changes make the plan stale

alter table programs 
  add column if not exists generation_inputs jsonb;

comment on column programs.generation_inputs is 
  'Snapshot of the profile answers that generated this block: goal, level, track, days/week, session minutes, equipment and injuries. Used to detect when a settings change makes the plan stale.';

-- Add 'superseded' status for plans replaced by a rebuild
-- (active plans become superseded when rebuilt, not completed - completed means the 4 weeks ran)

do $$ begin
  alter type program_status add value if not exists 'superseded';
exception
  when duplicate_object then null;
end $$;

comment on type program_status is 
  'Program lifecycle: active (current block), completed (ran its 4 weeks), superseded (replaced by a rebuild with different settings), abandoned (user stopped using it)';
