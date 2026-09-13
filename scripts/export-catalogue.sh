#!/usr/bin/env bash
# Refresh the catalogue fixture the generator tests run against.
# Run after changing the exercise seed.
set -euo pipefail
cd "$(dirname "$0")/.."
supabase db query --linked "
select json_agg(row_to_json(t))::text as catalogue from (
  select id, slug, name, movement_pattern, mechanic, metric, primary_muscles, equipment_ids,
         level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds
  from exercises where is_active order by slug) t;" \
| python3 -c "
import sys, json
raw = sys.stdin.read(); i = raw.find('{')
rows = json.loads(json.loads(raw[i:])['rows'][0]['catalogue'])
json.dump(rows, open('scripts/fixtures/catalogue.json','w'), indent=0)
print(f'exported {len(rows)} exercises to scripts/fixtures/catalogue.json')
"
