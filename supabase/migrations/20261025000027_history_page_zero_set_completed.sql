-- Migration: Include completed strength sessions with 0 working sets in History (change 6)
-- 
-- A COMPLETED strength session with 0 working sets (ended early before logging any set)
-- was missing from History. This migration updates get_history_page to include
-- completed sessions regardless of set count, while still excluding skipped, planned and rest.

create or replace function get_history_page(
  p_user uuid default auth.uid(),
  p_filter text default 'lifts',
  p_today date default current_date,
  p_limit int default 20,
  p_offset int default 0
)
returns table(session_id uuid, total_count bigint)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Ensure user is authenticated
  if p_user is null then
    raise exception 'User not authenticated';
  end if;

  -- Single predicate CTE for consistent filtering across page and count
  -- Normalize NULL and '' actual_type to 'weights'
  -- Includes: completed (strength REGARDLESS of set count, yoga/breathing always), any in_progress, abandoned (today only)
  -- Excludes: skipped
  -- Order: local_date desc, coalesce(completed_at, started_at) desc nulls last, id desc
  return query
  with all_matching as (
    select s.id
    from sessions s
    where s.user_id = p_user
      and s.status in ('completed', 'in_progress')
      and (
        -- Include completed sessions (always, regardless of local_date - QA TZ-1)
        (s.status = 'completed' and (
          -- Strength: include ALL completed sessions (even 0-set ones)
          (coalesce(nullif(s.actual_type::text,''),'weights') in ('weights', 'bodyweight'))
          -- Yoga/breathing: always included
          or s.actual_type in ('yoga', 'meditation')
        ))
        -- Include in_progress only if local_date <= p_today
        or (s.status = 'in_progress' and s.local_date <= p_today)
      )
      -- Apply type filter (normalize NULL and '' to 'weights')
      and (
        (p_filter = 'lifts' and coalesce(nullif(s.actual_type::text,''),'weights') in ('weights', 'bodyweight'))
        or (p_filter = 'yoga' and s.actual_type = 'yoga')
        or (p_filter = 'breathing' and s.actual_type = 'meditation')
      )
  ),
  total_count_cte as (
    select count(*)::bigint as total_count from all_matching
  ),
  page_sessions as (
    select
      s.id,
      s.local_date,
      s.completed_at,
      s.started_at
    from sessions s
    where s.id in (select id from all_matching)
    order by
      s.local_date desc,
      coalesce(s.completed_at, s.started_at) desc nulls last,
      s.id desc
    limit p_limit
    offset p_offset
  )
  select ps.id, tc.total_count
  from page_sessions ps
  cross join total_count_cte tc
  union all
  -- If page is empty, return one row with null session_id and the total_count
  select null::uuid, tc.total_count
  from total_count_cte tc
  where not exists (select 1 from page_sessions);
end;
$$;

comment on function get_history_page is
  'Returns paginated session IDs for History page with consistent ordering and total count. '
  'Single predicate ensures page results match count. '
  'Includes: completed (ALL strength sessions regardless of set count, yoga/breathing always), any in_progress, abandoned (today only). '
  'Excludes: skipped.';

revoke execute on function get_history_page(uuid, text, date, int, int) from public, anon;
grant execute on function get_history_page(uuid, text, date, int, int) to authenticated;
