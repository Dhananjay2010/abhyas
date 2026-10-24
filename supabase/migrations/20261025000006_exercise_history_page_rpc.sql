-- Exercise history RPC for efficient server-side PR computation
-- 
-- Reduces client requests from ~16 per page to 1 by computing PRs server-side
-- using window functions instead of fetching full history to the client.
--
-- Security: SECURITY INVOKER applies RLS from underlying tables.
-- Granted to authenticated role only (revoked from public and anon).

set local search_path = public, pg_temp;

-- Helper function: calculate Epley 1RM with reps capped at 12, rounded to 0.1 kg
create or replace function calculate_e1rm(reps int, weight_kg numeric)
returns numeric
language sql immutable parallel safe
set search_path = public, pg_temp
as $$
  select case
    when reps is null or reps < 1 then null
    when weight_kg is null or weight_kg <= 0 then null
    when reps = 1 then weight_kg
    else round((weight_kg * (1 + least(reps, 12)::numeric / 30)) * 10) / 10
  end;
$$;

-- Main RPC: get exercise history page with server-side PR detection
create or replace function get_exercise_history_page(
  p_user_id uuid,
  p_exercise_id uuid,
  p_limit int default 10,
  p_offset int default 0
)
returns jsonb
language plpgsql
security invoker
stable
parallel safe
set search_path = public, pg_temp
as $$
declare
  v_total_count int;
  v_result jsonb;
  v_sessions jsonb;
  v_current_prs jsonb;
  v_metric text;
begin
  -- Get total count
  select count(*)
  into v_total_count
  from exercise_history
  where user_id = p_user_id
    and exercise_id = p_exercise_id;

  if v_total_count = 0 then
    return jsonb_build_object(
      'sessions', '[]'::jsonb,
      'totalCount', 0,
      'currentPRs', '[]'::jsonb
    );
  end if;

  -- Get primary metric from first session
  select metric
  into v_metric
  from exercise_history
  where user_id = p_user_id
    and exercise_id = p_exercise_id
  order by completed_at asc, session_exercise_id asc
  limit 1;

  -- Build sessions with PR detection
  with 
  -- All history in chronological order with row numbers
  full_history as (
    select 
      eh.session_exercise_id,
      eh.session_id,
      eh.local_date,
      eh.metric,
      eh.completed_at,
      row_number() over (order by eh.completed_at asc, eh.session_exercise_id asc) as chron_order
    from exercise_history eh
    where eh.user_id = p_user_id
      and eh.exercise_id = p_exercise_id
  ),
  -- Paginated rows to display (newest first)
  display_rows as (
    select 
      eh.session_exercise_id,
      eh.session_id,
      eh.local_date,
      eh.metric,
      eh.completed_at,
      fh.chron_order
    from exercise_history eh
    join full_history fh on fh.session_exercise_id = eh.session_exercise_id
    where eh.user_id = p_user_id
      and eh.exercise_id = p_exercise_id
    order by eh.completed_at desc, eh.session_exercise_id desc
    limit p_limit offset p_offset
  ),
  -- All sets for all history (for PR computation)
  all_sets as (
    select
      ss.session_exercise_id,
      ss.reps,
      ss.weight_kg,
      ss.duration_seconds,
      fh.chron_order,
      ss.set_number
    from session_sets ss
    join full_history fh on fh.session_exercise_id = ss.session_exercise_id
    where ss.is_warmup_set = false
    order by fh.chron_order, ss.set_number
  ),
  -- Compute per-session aggregates and PRs
  session_data as (
    select
      dr.session_exercise_id,
      dr.session_id,
      dr.local_date,
      dr.metric,
      dr.chron_order,
      -- Collect sets for this session
      jsonb_agg(
        jsonb_build_object(
          'reps', s.reps,
          'weight_kg', s.weight_kg,
          'duration_seconds', s.duration_seconds
        ) order by s.set_number
      ) as sets,
      -- Aggregates for PR detection
      coalesce(max(s.weight_kg), 0) as max_weight,
      coalesce(max(s.reps), 0) as max_reps,
      coalesce(max(s.duration_seconds), 0) as max_duration,
      coalesce(max(calculate_e1rm(s.reps, s.weight_kg)), 0) as max_e1rm,
      -- Check if weighted
      bool_or(s.weight_kg > 0) as has_weight
    from display_rows dr
    left join all_sets s on s.session_exercise_id = dr.session_exercise_id
    group by dr.session_exercise_id, dr.session_id, dr.local_date, dr.metric, dr.chron_order
  ),
  -- Compute earlier bests for each displayed session
  earlier_bests as (
    select
      sd.session_exercise_id,
      sd.chron_order,
      -- Earlier bests (all sets before this session)
      coalesce(max(s.weight_kg) filter (where s.chron_order < sd.chron_order), 0) as prev_max_weight,
      coalesce(max(calculate_e1rm(s.reps, s.weight_kg)) filter (where s.chron_order < sd.chron_order), 0) as prev_max_e1rm,
      coalesce(max(s.duration_seconds) filter (where s.chron_order < sd.chron_order), 0) as prev_max_duration
    from session_data sd
    cross join all_sets s
    group by sd.session_exercise_id, sd.chron_order
  ),
  -- Compute rep PRs using set-by-set logic
  rep_prs as (
    select
      sd.session_exercise_id,
      sd.chron_order,
      -- Best reps PR for weighted: check each set against earlier sets at same/heavier weight
      case
        when sd.has_weight and sd.metric = 'reps' then
          (
            select max(curr.reps)
            from all_sets curr
            where curr.session_exercise_id = sd.session_exercise_id
              and curr.reps > coalesce(
                (
                  select max(prev.reps)
                  from all_sets prev
                  where prev.chron_order < sd.chron_order
                    and prev.weight_kg >= curr.weight_kg
                    and prev.reps is not null
                ),
                0
              )
          )
        when not sd.has_weight and sd.metric = 'reps' then
          -- Bodyweight: plain most-reps
          case
            when sd.max_reps > (select coalesce(max(s.reps), 0) from all_sets s where s.chron_order < sd.chron_order)
            then sd.max_reps
            else null
          end
        else null
      end as rep_pr_value
    from session_data sd
  ),
  -- Build PR arrays for each session
  session_prs as (
    select
      sd.session_exercise_id,
      -- First session gets no badges
      case when sd.chron_order = 1 then '[]'::jsonb
      else
        jsonb_agg(
          jsonb_build_object(
            'type', pr_type,
            'value', pr_value,
            'set', pr_set,
            'e1rm', pr_e1rm
          )
        ) filter (where pr_type is not null)
      end as prs
    from session_data sd
    join earlier_bests eb on eb.session_exercise_id = sd.session_exercise_id
    left join rep_prs rp on rp.session_exercise_id = sd.session_exercise_id
    cross join lateral (
      values
        -- Heaviest weight PR
        (
          case when sd.has_weight and sd.metric = 'reps' and sd.max_weight > eb.prev_max_weight
          then 'heaviest_weight' else null end,
          case when sd.has_weight and sd.metric = 'reps' and sd.max_weight > eb.prev_max_weight
          then sd.max_weight else null end,
          case when sd.has_weight and sd.metric = 'reps' and sd.max_weight > eb.prev_max_weight
          then (select jsonb_build_object('reps', reps, 'weight_kg', weight_kg, 'duration_seconds', duration_seconds)
                from all_sets where session_exercise_id = sd.session_exercise_id and weight_kg = sd.max_weight limit 1)
          else null end,
          case when sd.has_weight and sd.metric = 'reps' and sd.max_weight > eb.prev_max_weight
          then (select calculate_e1rm(reps, weight_kg) from all_sets where session_exercise_id = sd.session_exercise_id and weight_kg = sd.max_weight limit 1)
          else null end
        ),
        -- Best e1RM PR
        (
          case when sd.has_weight and sd.metric = 'reps' and sd.max_e1rm > eb.prev_max_e1rm
          then 'best_e1rm' else null end,
          case when sd.has_weight and sd.metric = 'reps' and sd.max_e1rm > eb.prev_max_e1rm
          then sd.max_e1rm else null end,
          case when sd.has_weight and sd.metric = 'reps' and sd.max_e1rm > eb.prev_max_e1rm
          then (select jsonb_build_object('reps', reps, 'weight_kg', weight_kg, 'duration_seconds', duration_seconds)
                from all_sets where session_exercise_id = sd.session_exercise_id 
                  and calculate_e1rm(reps, weight_kg) = sd.max_e1rm limit 1)
          else null end,
          case when sd.has_weight and sd.metric = 'reps' and sd.max_e1rm > eb.prev_max_e1rm
          then sd.max_e1rm else null end
        ),
        -- Most reps PR
        (
          case when rp.rep_pr_value is not null then 'most_reps' else null end,
          rp.rep_pr_value,
          case when rp.rep_pr_value is not null
          then (select jsonb_build_object('reps', reps, 'weight_kg', weight_kg, 'duration_seconds', duration_seconds)
                from all_sets where session_exercise_id = sd.session_exercise_id and reps = rp.rep_pr_value limit 1)
          else null end,
          case when rp.rep_pr_value is not null and sd.has_weight
          then (select calculate_e1rm(reps, weight_kg) from all_sets where session_exercise_id = sd.session_exercise_id and reps = rp.rep_pr_value limit 1)
          else null end
        ),
        -- Longest duration PR
        (
          case when sd.metric = 'seconds' and sd.max_duration > eb.prev_max_duration
          then 'longest_duration' else null end,
          case when sd.metric = 'seconds' and sd.max_duration > eb.prev_max_duration
          then sd.max_duration else null end,
          case when sd.metric = 'seconds' and sd.max_duration > eb.prev_max_duration
          then (select jsonb_build_object('reps', reps, 'weight_kg', weight_kg, 'duration_seconds', duration_seconds)
                from all_sets where session_exercise_id = sd.session_exercise_id and duration_seconds = sd.max_duration limit 1)
          else null end,
          null::numeric
        )
    ) as pr_data(pr_type, pr_value, pr_set, pr_e1rm)
    group by sd.session_exercise_id, sd.chron_order
  ),
  -- Compute top set and aggregates
  session_complete as (
    select
      sd.session_id,
      sd.local_date as date,
      sd.sets,
      -- Top set
      (
        case
          when sd.metric = 'seconds' then
            (select jsonb_build_object('reps', reps, 'weight_kg', weight_kg, 'duration_seconds', duration_seconds)
             from all_sets where session_exercise_id = sd.session_exercise_id
             order by duration_seconds desc nulls last limit 1)
          when sd.has_weight then
            (select jsonb_build_object('reps', reps, 'weight_kg', weight_kg, 'duration_seconds', duration_seconds)
             from all_sets where session_exercise_id = sd.session_exercise_id
             order by calculate_e1rm(reps, weight_kg) desc nulls last limit 1)
          else
            (select jsonb_build_object('reps', reps, 'weight_kg', weight_kg, 'duration_seconds', duration_seconds)
             from all_sets where session_exercise_id = sd.session_exercise_id
             order by reps desc nulls last limit 1)
        end
      ) as "topSet",
      -- Volume
      (
        select coalesce(sum(coalesce(reps, 0) * coalesce(weight_kg, 0)), 0)
        from all_sets where session_exercise_id = sd.session_exercise_id
      ) as "volumeKg",
      -- e1RM
      (
        case
          when sd.metric = 'seconds' then null
          when sd.has_weight then sd.max_e1rm
          else null
        end
      ) as "estimatedOneRepMax",
      -- PRs
      coalesce(sp.prs, '[]'::jsonb) as prs,
      sd.metric
    from session_data sd
    left join session_prs sp on sp.session_exercise_id = sd.session_exercise_id
    order by sd.chron_order desc
  )
  select jsonb_agg(
    jsonb_build_object(
      'sessionId', session_id,
      'date', date,
      'sets', sets,
      'topSet', "topSet",
      'volumeKg', "volumeKg",
      'estimatedOneRepMax', "estimatedOneRepMax",
      'prs', prs,
      'metric', metric
    )
  )
  into v_sessions
  from session_complete;

  -- Compute current PRs across all history
  with all_history_sets as (
    select
      ss.reps,
      ss.weight_kg,
      ss.duration_seconds,
      fh.chron_order
    from all_sets ss
    join full_history fh on fh.session_exercise_id = ss.session_exercise_id
  ),
  has_weight_check as (
    select bool_or(weight_kg > 0) as has_weight
    from all_history_sets
  )
  select jsonb_agg(
    jsonb_build_object(
      'type', pr_type,
      'value', pr_value,
      'set', pr_set,
      'e1rm', pr_e1rm
    )
  )
  into v_current_prs
  from has_weight_check
  cross join lateral (
    values
      -- Heaviest weight
      (
        case when v_metric = 'reps' and has_weight
        then 'heaviest_weight' else null end,
        case when v_metric = 'reps' and has_weight
        then (select max(weight_kg) from all_history_sets) else null end,
        case when v_metric = 'reps' and has_weight
        then (select jsonb_build_object('reps', reps, 'weight_kg', weight_kg, 'duration_seconds', duration_seconds)
              from all_history_sets where weight_kg = (select max(weight_kg) from all_history_sets) limit 1)
        else null end,
        case when v_metric = 'reps' and has_weight
        then (select calculate_e1rm(reps, weight_kg) from all_history_sets where weight_kg = (select max(weight_kg) from all_history_sets) limit 1)
        else null end
      ),
      -- Best e1RM
      (
        case when v_metric = 'reps' and has_weight
        then 'best_e1rm' else null end,
        case when v_metric = 'reps' and has_weight
        then (select max(calculate_e1rm(reps, weight_kg)) from all_history_sets) else null end,
        case when v_metric = 'reps' and has_weight
        then (select jsonb_build_object('reps', reps, 'weight_kg', weight_kg, 'duration_seconds', duration_seconds)
              from all_history_sets where calculate_e1rm(reps, weight_kg) = (select max(calculate_e1rm(reps, weight_kg)) from all_history_sets) limit 1)
        else null end,
        case when v_metric = 'reps' and has_weight
        then (select max(calculate_e1rm(reps, weight_kg)) from all_history_sets) else null end
      ),
      -- Most reps (weighted: per-weight logic; bodyweight: plain)
      (
        case when v_metric = 'reps' then 'most_reps' else null end,
        case 
          when v_metric = 'reps' and has_weight then
            -- Best rep PR across all history
            (
              select max(curr.reps)
              from all_history_sets curr
              where curr.reps > coalesce(
                (
                  select max(prev.reps)
                  from all_history_sets prev
                  where prev.chron_order < curr.chron_order
                    and prev.weight_kg >= curr.weight_kg
                ),
                0
              )
            )
          when v_metric = 'reps' then
            (select max(reps) from all_history_sets)
          else null
        end,
        case when v_metric = 'reps'
        then (select jsonb_build_object('reps', reps, 'weight_kg', weight_kg, 'duration_seconds', duration_seconds)
              from all_history_sets 
              where reps = (
                case 
                  when has_weight then
                    (select max(curr.reps) from all_history_sets curr
                     where curr.reps > coalesce((select max(prev.reps) from all_history_sets prev
                       where prev.chron_order < curr.chron_order and prev.weight_kg >= curr.weight_kg), 0))
                  else (select max(reps) from all_history_sets)
                end
              )
              limit 1)
        else null end,
        case when v_metric = 'reps' and has_weight
        then (select calculate_e1rm(reps, weight_kg) from all_history_sets 
              where reps = (select max(curr.reps) from all_history_sets curr
                            where curr.reps > coalesce((select max(prev.reps) from all_history_sets prev
                              where prev.chron_order < curr.chron_order and prev.weight_kg >= curr.weight_kg), 0))
              limit 1)
        else null end
      ),
      -- Longest duration
      (
        case when v_metric = 'seconds' then 'longest_duration' else null end,
        case when v_metric = 'seconds' then (select max(duration_seconds) from all_history_sets) else null end,
        case when v_metric = 'seconds'
        then (select jsonb_build_object('reps', reps, 'weight_kg', weight_kg, 'duration_seconds', duration_seconds)
              from all_history_sets where duration_seconds = (select max(duration_seconds) from all_history_sets) limit 1)
        else null end,
        null::numeric
      )
  ) as pr_data(pr_type, pr_value, pr_set, pr_e1rm)
  where pr_type is not null;

  -- Build final result
  return jsonb_build_object(
    'sessions', coalesce(v_sessions, '[]'::jsonb),
    'totalCount', v_total_count,
    'currentPRs', coalesce(v_current_prs, '[]'::jsonb)
  );
end;
$$;

comment on function get_exercise_history_page is
  'Efficient server-side exercise history query with PR detection. '
  'Reduces client round-trips by computing PRs using window functions. '
  'SECURITY INVOKER applies RLS from exercise_history view and session_sets table.';

-- Grant to authenticated users only
grant execute on function get_exercise_history_page to authenticated;
revoke execute on function get_exercise_history_page from public, anon;

grant execute on function calculate_e1rm to authenticated;
revoke execute on function calculate_e1rm from public, anon;
