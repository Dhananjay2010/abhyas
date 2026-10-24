/*
  Partial unique index: one in_progress session per user.
  
  This prevents the duplicate-session race condition in case (C) where
  Today briefly showed 'Start session' instead of 'Resume' after leaving
  a workout, which could have created duplicate in_progress rows.
  
  The startSessionCore logic already handles 23505 by re-reading and
  returning the existing in_progress session for that user.
  
  This index requires zero existing duplicate in_progress rows for the
  same user_id. The coordinator must re-check production data before
  applying this migration. If duplicates exist in production, they must
  be manually resolved (keeping the newest per user, closing the rest
  with status='skipped' and ended_at=now()) before this migration runs.
*/

create unique index if not exists sessions_one_in_progress_per_user_idx
  on sessions (user_id)
  where status = 'in_progress';
