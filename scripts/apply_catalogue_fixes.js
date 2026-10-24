#!/usr/bin/env node
/**
 * Apply catalogue fixture updates from migrations while preserving main's format.
 * Run: node scripts/apply_catalogue_fixes.js
 */

const fs = require('fs');
const path = require('path');

const cataloguePath = path.join(__dirname, 'fixtures/catalogue.json');
const data = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));

const bySlug = {};
for (const ex of data) {
  bySlug[ex.slug] = ex;
}

// Track changes
const changes = [];

// Simple property updates (from migrations 110100 and 110200)
const simpleUpdates = {
  'alternating-kettlebell-row': { mechanic: 'compound' },
  'incline-bench-pull': { mechanic: 'compound' },
  'bent-over-two-dumbbell-row-with-palms-in': { mechanic: 'compound' },
  'bent-over-two-dumbbell-row': { mechanic: 'compound' },
  'sumo-deadlift': { primary_muscles: ['glutes'] },
  'reverse-band-sumo-deadlift': { primary_muscles: ['glutes'] },
  'sumo-deadlift-with-bands': { primary_muscles: ['glutes'] },
  'sumo-deadlift-with-chains': { primary_muscles: ['glutes'] },
  'dumbbell-seated-box-jump': { impact: 'high', level_min: 'intermediate' },
  'lunge-sprint': { level_min: 'intermediate', impact: 'high' },
  'straight-arm-dumbbell-pullover': { movement_pattern: 'horizontal_pull' },
  'one-arm-kettlebell-split-snatch': { movement_pattern: 'hinge' },
  'double-kettlebell-snatch': { movement_pattern: 'hinge' },
  'glute-kickback': { mechanic: 'isolation', movement_pattern: 'other' },
  'inverted-row': { equipment_ids: ['pull_up_bar'] },
};

// Contraindication updates (append, don't replace)
const contraUpdates = {
  'straight-arm-dumbbell-pullover': 'shoulder',
  'standing-dumbbell-straight-arm-front-delt-raise-above-head': 'shoulder',
  'standing-front-barbell-raise-over-head': 'shoulder',
  'single-dumbbell-raise': 'shoulder',
  'seated-dumbbell-press': 'shoulder',
  'crunch-hands-overhead': 'lower_back',
  'oblique-crunches': 'lower_back',
  'decline-crunch': 'lower_back',
};

// Apply contraindication updates
for (const [slug, region] of Object.entries(contraUpdates)) {
  if (bySlug[slug]) {
    const existing = bySlug[slug].contraindicated_regions || [];
    if (!existing.includes(region)) {
      bySlug[slug].contraindicated_regions = [...existing, region];
      changes.push(`${slug}: +${region} contraindication`);
    }
  }
}

// Apply simple updates
for (const [slug, updates] of Object.entries(simpleUpdates)) {
  if (bySlug[slug]) {
    for (const [key, val] of Object.entries(updates)) {
      const oldVal = bySlug[slug][key];
      if (JSON.stringify(oldVal) !== JSON.stringify(val)) {
        bySlug[slug][key] = val;
        changes.push(`${slug}: ${key}`);
      }
    }
  }
}

// Add new exercises (from migration 110100) with valid deterministic UUIDs
const newExercises = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'pike-push-up',
    name: 'Pike Push-Up',
    movement_pattern: 'vertical_press',
    mechanic: 'compound',
    metric: 'reps',
    primary_muscles: ['front_delts', 'triceps'],
    equipment_ids: [],
    level_min: 'beginner',
    contraindicated_regions: ['shoulder'],
    impact: 'low',
    spinal_load: 'none',
    tracks: ['weights', 'bodyweight'],
    default_rest_seconds: 90,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    slug: 'doorway-row',
    name: 'Doorway Row',
    movement_pattern: 'horizontal_pull',
    mechanic: 'compound',
    metric: 'reps',
    primary_muscles: ['lats', 'upper_back'],
    equipment_ids: [],
    level_min: 'beginner',
    contraindicated_regions: ['shoulder'],
    impact: 'low',
    spinal_load: 'none',
    tracks: ['bodyweight'],
    default_rest_seconds: 120,
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    slug: 'glute-bridge',
    name: 'Glute Bridge',
    movement_pattern: 'hinge',
    mechanic: 'compound',
    metric: 'reps',
    primary_muscles: ['glutes', 'hamstrings'],
    equipment_ids: [],
    level_min: 'beginner',
    contraindicated_regions: [],
    impact: 'low',
    spinal_load: 'none',
    tracks: ['weights', 'bodyweight'],
    default_rest_seconds: 90,
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    slug: 'inverted-row',
    name: 'Inverted Row',
    movement_pattern: 'horizontal_pull',
    mechanic: 'compound',
    metric: 'reps',
    primary_muscles: ['lats', 'upper_back'],
    equipment_ids: ['pull_up_bar'],
    level_min: 'beginner',
    contraindicated_regions: ['shoulder'],
    impact: 'low',
    spinal_load: 'none',
    tracks: ['bodyweight'],
    default_rest_seconds: 120,
  },
];

for (const newEx of newExercises) {
  if (!bySlug[newEx.slug]) {
    data.push(newEx);
    bySlug[newEx.slug] = newEx;
    changes.push(`Added ${newEx.slug}`);
  }
}

// Sort by slug to maintain consistent order
data.sort((a, b) => a.slug.localeCompare(b.slug));

// Write with main's format: JSON.stringify with 2-space indent, then remove leading spaces
const output = JSON.stringify(data, null, 2).replace(/^ +/gm, '') + '\n';
fs.writeFileSync(cataloguePath, output);

console.log(`Applied ${changes.length} changes to catalogue.json`);
changes.forEach(c => console.log(`  ${c}`));
