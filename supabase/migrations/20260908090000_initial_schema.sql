-- Abhyas — initial schema
-- Reference tables are public-read; every user table is RLS-protected (see next migration).

-- ============================================================
-- ENUMS
-- ============================================================
create type sex_type            as enum ('male','female','other','prefer_not_to_say');
create type fitness_level       as enum ('beginner','intermediate','expert');
create type fitness_goal        as enum ('fat_loss','muscle_gain','strength','general_fitness','flexibility_stress');
create type track_type          as enum ('weights','bodyweight','yoga','meditation');
create type day_type            as enum ('weights','bodyweight','yoga','meditation','rest','active_recovery');
create type planning_mode       as enum ('progression','daily_menu');
create type session_status      as enum ('planned','in_progress','completed','skipped','rest');
create type exercise_status     as enum ('pending','completed','skipped','swapped_out');
create type set_feel            as enum ('easy','right','hard');
create type injury_severity     as enum ('current','past');
create type impact_level        as enum ('low','medium','high');
create type spinal_load_level   as enum ('none','low','high');
create type mechanic_type       as enum ('compound','isolation');
create type force_type          as enum ('push','pull','static');
create type exercise_category   as enum ('strength','cardio','mobility','stretch','plyometric');
create type media_type          as enum ('photo','gif','video_youtube');
create type equipment_category  as enum ('bodyweight','free_weight','machine','cable','accessory');
create type split_type          as enum ('full_body','upper_lower','ppl','custom');
create type program_status      as enum ('active','completed','abandoned');
create type warmup_type         as enum ('cardio','mobility','prehab');
create type bodyweight_prompt   as enum ('daily','weekly','never');

create type body_region as enum (
  'neck','shoulder','elbow','wrist','upper_back','lower_back',
  'hip','knee','ankle','core'
);

create type muscle as enum (
  'chest','lats','upper_back','traps','lower_back',
  'front_delts','side_delts','rear_delts',
  'biceps','triceps','forearms',
  'abs','obliques',
  'glutes','quads','hamstrings','calves',
  'hip_flexors','adductors','abductors',
  'neck','full_body','cardio'
);

-- ============================================================
-- REFERENCE TABLES
-- ============================================================

create table equipment (
  id            text primary key,             -- slug, e.g. 'barbell'
  name          text not null,
  category      equipment_category not null,
  sort_order    int not null default 0
);

create table exercises (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text unique not null,
  name                    text not null,
  aliases                 text[] not null default '{}',
  tracks                  track_type[] not null,
  category                exercise_category not null,
  mechanic                mechanic_type,
  force                   force_type,
  primary_muscles         muscle[] not null,
  secondary_muscles       muscle[] not null default '{}',
  -- every id here must be in the user's available set for the exercise to be offered
  equipment_ids           text[] not null default '{}',
  level_min               fitness_level not null default 'beginner',
  instructions            text[] not null default '{}',
  -- safety filters
  contraindicated_regions body_region[] not null default '{}',
  impact                  impact_level not null default 'low',
  spinal_load             spinal_load_level not null default 'none',
  -- prescription
  default_rest_seconds    int not null default 90,
  is_unilateral           boolean not null default false,
  -- bodyweight progression: same chain, ordered by rank (knee push-up -> push-up -> decline...)
  progression_chain       text,
  progression_rank        int,
  -- provenance, so we can audit licensing later
  source                  text,
  source_licence          text,
  source_attribution      text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now()
);

create index exercises_equipment_idx  on exercises using gin (equipment_ids);
create index exercises_primary_idx    on exercises using gin (primary_muscles);
create index exercises_tracks_idx     on exercises using gin (tracks);
create index exercises_chain_idx      on exercises (progression_chain, progression_rank);

-- Media is deliberately a separate table so the source (wger photos -> licensed GIFs)
-- can be swapped as a data migration. Never hardcode a media URL in a component.
create table exercise_media (
  id           uuid primary key default gen_random_uuid(),
  exercise_id  uuid not null references exercises(id) on delete cascade,
  type         media_type not null,
  url          text,
  youtube_id   text,
  position     int not null default 0,
  attribution  text,
  licence      text,
  created_at   timestamptz not null default now(),
  constraint exercise_media_payload_check check (
    (type = 'video_youtube' and youtube_id is not null)
    or (type in ('photo','gif') and url is not null)
  )
);
create index exercise_media_exercise_idx on exercise_media (exercise_id, position);

-- Manual overrides only. The default substitution list is computed at runtime from
-- matching muscles + the user's available equipment.
create table exercise_substitutions (
  exercise_id            uuid not null references exercises(id) on delete cascade,
  substitute_exercise_id uuid not null references exercises(id) on delete cascade,
  rank                   int not null default 0,
  primary key (exercise_id, substitute_exercise_id),
  constraint no_self_substitution check (exercise_id <> substitute_exercise_id)
);

create table warmup_exercises (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  name             text not null,
  type             warmup_type not null,
  target_regions   body_region[] not null default '{}',
  target_muscles   muscle[] not null default '{}',
  duration_seconds int not null default 60,
  instructions     text[] not null default '{}',
  is_active        boolean not null default true
);

create table breathing_patterns (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  name              text not null,
  description       text,
  inhale_seconds    numeric(4,1) not null,
  hold_in_seconds   numeric(4,1) not null default 0,
  exhale_seconds    numeric(4,1) not null,
  hold_out_seconds  numeric(4,1) not null default 0,
  default_cycles    int not null default 10,
  benefit           text,
  contraindications text,
  level             fitness_level not null default 'beginner',
  sort_order        int not null default 0
);

create table yoga_playlists (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  title               text not null,
  creator             text not null default 'Yoga with Adriene',
  channel_url         text,
  youtube_playlist_id text,
  description         text,
  level               fitness_level not null default 'beginner',
  is_series           boolean not null default false,
  sort_order          int not null default 0
);

create table yoga_videos (
  id               uuid primary key default gen_random_uuid(),
  playlist_id      uuid not null references yoga_playlists(id) on delete cascade,
  youtube_video_id text not null,
  title            text not null,
  duration_minutes int,
  day_index        int,
  focus_areas      text[] not null default '{}',
  sort_order       int not null default 0
);
create index yoga_videos_playlist_idx on yoga_videos (playlist_id, sort_order);

-- ============================================================
-- USER TABLES
-- ============================================================

create table profiles (
  id                        uuid primary key references auth.users(id) on delete cascade,
  display_name              text,
  avatar_url                text,
  date_of_birth             date,          -- stored, not age, so it never goes stale
  sex                       sex_type,
  height_cm                 numeric(5,1),
  level                     fitness_level,
  goal                      fitness_goal,
  primary_track             track_type,
  days_per_week             int check (days_per_week between 3 and 6),
  yoga_days_per_week        int not null default 0 check (yoga_days_per_week between 0 and 6),
  preferred_session_minutes int not null default 60,
  has_all_equipment         boolean not null default false,
  timezone                  text not null default 'Asia/Kolkata',
  units                     text not null default 'metric',
  onboarding_completed_at   timestamptz,
  disclaimer_accepted_at    timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table user_settings (
  user_id                   uuid primary key references auth.users(id) on delete cascade,
  planning_mode             planning_mode not null default 'progression',
  per_set_logging           boolean not null default true,
  resume_session            boolean not null default true,
  cooldown_enabled          boolean not null default true,
  rest_timer_autostart      boolean not null default true,
  rest_timer_sound          boolean not null default true,
  rest_timer_vibrate        boolean not null default true,
  rest_seconds_override     int,
  bodyweight_prompt         bodyweight_prompt not null default 'weekly',
  meditation_default_minutes int not null default 10,
  theme                     text not null default 'dark',
  safety_overrides          jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- presence of a row means the user has that equipment
create table user_equipment (
  user_id      uuid not null references auth.users(id) on delete cascade,
  equipment_id text not null references equipment(id) on delete cascade,
  primary key (user_id, equipment_id)
);

create table user_injuries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  body_region body_region not null,
  severity    injury_severity not null default 'current',
  note        text,
  created_at  timestamptz not null default now(),
  unique (user_id, body_region)
);

create table programs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  block_number  int not null default 1,
  split_type    split_type not null,
  days_per_week int not null,
  primary_track track_type not null,
  goal          fitness_goal not null,   -- snapshot of the inputs that generated this block
  level         fitness_level not null,
  started_on    date not null,
  ends_on       date not null,
  deload_week   int not null default 4,
  status        program_status not null default 'active',
  created_at    timestamptz not null default now()
);
create unique index programs_one_active_per_user
  on programs (user_id) where (status = 'active');

create table program_days (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  day_index  int not null check (day_index between 1 and 7),
  day_type   day_type not null,
  focus      text,
  label      text,
  unique (program_id, day_index)
);

create table program_day_exercises (
  id              uuid primary key default gen_random_uuid(),
  program_day_id  uuid not null references program_days(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  exercise_id     uuid not null references exercises(id),
  order_index     int not null,
  target_sets     int not null default 3,
  target_reps_min int not null default 8,
  target_reps_max int not null default 12,
  rest_seconds    int not null default 90,
  notes           text,
  unique (program_day_id, order_index)
);

create table sessions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  program_id           uuid references programs(id) on delete set null,
  program_day_id       uuid references program_days(id) on delete set null,
  local_date           date not null,      -- computed in the user's timezone; the day-wise key
  week_in_block        int,
  is_deload            boolean not null default false,
  planned_type         day_type,
  actual_type          day_type,
  status               session_status not null default 'planned',
  started_at           timestamptz,
  completed_at         timestamptz,
  duration_seconds     int,
  warmup_completed     boolean not null default false,
  cooldown_completed   boolean not null default false,
  energy_rating        int check (energy_rating between 1 and 5),
  notes                text,
  yoga_video_id        uuid references yoga_videos(id) on delete set null,
  breathing_pattern_id uuid references breathing_patterns(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index sessions_user_date_idx on sessions (user_id, local_date desc);

create table session_exercises (
  id                      uuid primary key default gen_random_uuid(),
  session_id              uuid not null references sessions(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  exercise_id             uuid not null references exercises(id),
  order_index             int not null,
  planned_sets            int,
  planned_reps_min        int,
  planned_reps_max        int,
  rest_seconds            int,
  status                  exercise_status not null default 'pending',
  swapped_from_exercise_id uuid references exercises(id),
  feel                    set_feel,
  notes                   text,
  completed_at            timestamptz,
  unique (session_id, order_index)
);

create table session_sets (
  id                  uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references session_exercises(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  set_number          int not null,
  reps                int,
  weight_kg           numeric(6,2),
  duration_seconds    int,
  is_warmup_set       boolean not null default false,
  completed_at        timestamptz not null default now(),
  unique (session_exercise_id, set_number, is_warmup_set)
);

-- The heart of the progression engine: where the user currently stands on each lift.
create table exercise_progress (
  user_id                  uuid not null references auth.users(id) on delete cascade,
  exercise_id              uuid not null references exercises(id) on delete cascade,
  current_working_weight_kg numeric(6,2),
  current_target_reps      int,
  consecutive_failures     int not null default 0,
  last_performed_on        date,
  best_weight_kg           numeric(6,2),
  best_reps                int,
  best_e1rm                numeric(6,2),
  total_sessions           int not null default 0,
  updated_at               timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

create table body_metrics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  recorded_on  date not null,
  weight_kg    numeric(5,2) not null,
  body_fat_pct numeric(4,1),
  notes        text,
  created_at   timestamptz not null default now(),
  unique (user_id, recorded_on)
);

create table user_yoga_progress (
  user_id             uuid not null references auth.users(id) on delete cascade,
  playlist_id         uuid not null references yoga_playlists(id) on delete cascade,
  completed_video_ids uuid[] not null default '{}',
  last_completed_at   timestamptz,
  primary key (user_id, playlist_id)
);
