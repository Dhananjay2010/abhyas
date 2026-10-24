-- Add client_id to session_sets for idempotent offline-safe logging
--
-- When offline, set logs are queued locally with a client-generated UUID.
-- On reconnect, replays use the same key so the server can deduplicate.
-- The unique constraint ensures a set with the same client_id can never
-- be inserted twice, even across retries or multiple tabs.

alter table session_sets
  add column client_id uuid;

-- Unique per user: two users can use the same UUID without conflict.
-- Partial index: only rows with a client_id are constrained, so existing
-- rows with null are untouched and the migration is non-blocking.
create unique index session_sets_client_id_user_key
  on session_sets (user_id, client_id)
  where client_id is not null;

comment on column session_sets.client_id is
  'Client-generated idempotency key for offline-safe set logging. '
  'When a set is logged offline, the client queues it with a UUID. '
  'On reconnect, the replay uses the same key and upsert prevents duplicates.';
