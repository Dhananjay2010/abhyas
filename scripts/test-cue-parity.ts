#!/usr/bin/env tsx
import { spawnSync } from 'child_process';
import { buildCue } from './lib/cue-builder';

const testCases = [
  { mechanic: 'compound', pattern: 'squat', primary: ['quads', 'glutes'], equipment: ['barbell'] },
  { mechanic: 'compound', pattern: 'hinge', primary: ['hamstrings', 'glutes', 'lower_back'], equipment: ['barbell'] },
  { mechanic: 'isolation', pattern: 'biceps', primary: ['biceps'], equipment: ['dumbbell'] },
  { mechanic: null, pattern: 'core', primary: ['abs'], equipment: [] },
  { mechanic: 'compound', pattern: 'push', primary: ['chest', 'front_delts', 'triceps'], equipment: ['barbell'] },
  { mechanic: null, pattern: 'cardio', primary: ['quads', 'glutes', 'calves'], equipment: [] },
  { mechanic: 'isolation', pattern: 'other', primary: ['forearms'], equipment: ['dumbbell'] },
  { mechanic: null, pattern: 'static', primary: ['abs', 'lower_back'], equipment: [] },
];

const pythonScript = `
import sys
import json

MUSCLE_LABEL = {
    "abs": "abs", "obliques": "obliques", "chest": "chest", "lats": "lats",
    "upper_back": "upper back", "lower_back": "lower back", "traps": "traps",
    "front_delts": "front delts", "side_delts": "side delts",
    "rear_delts": "rear delts", "biceps": "biceps", "triceps": "triceps",
    "forearms": "forearms", "glutes": "glutes", "quads": "quads",
    "hamstrings": "hamstrings", "calves": "calves", "hip_flexors": "hip flexors",
    "adductors": "adductors", "abductors": "abductors", "neck": "neck",
}

EQUIPMENT_LABEL = {
    "barbell": "Barbell", "dumbbell": "Dumbbell", "cable_machine": "Cable",
    "kettlebell": "Kettlebell", "resistance_band": "Bands", "ez_bar": "EZ Bar",
    "machine_generic": "Machine", "leg_press": "Leg Press", "hack_squat": "Hack Squat",
    "leg_curl": "Leg Curl Machine", "leg_extension": "Leg Extension Machine",
    "lat_pulldown": "Lat Pulldown", "pec_deck": "Pec Deck",
    "chest_press_machine": "Chest Press Machine", "seated_row_machine": "Seated Row Machine",
    "smith_machine": "Smith Machine", "pull_up_bar": "Pull-up Bar",
    "dip_bars": "Dip Station", "flat_bench": "Bench", "adjustable_bench": "Bench",
    "squat_rack": "Squat Rack", "medicine_ball": "Medicine Ball",
    "stability_ball": "Stability Ball", "foam_roller": "Foam Roller",
    "jump_rope": "Jump Rope", "ab_wheel": "Ab Wheel",
}

def build_cue(mechanic, pattern, primary, equipment):
    mechanic_label = mechanic or ''
    pattern_label = pattern.replace('_', ' ') if pattern else ''
    
    skip_pattern = (
        not pattern_label or
        pattern_label == 'other' or
        pattern_label == 'static' or
        (len(primary) == 1 and primary[0] and pattern_label == MUSCLE_LABEL.get(primary[0], ''))
    )
    
    if skip_pattern:
        movement_prefix = (
            mechanic_label if mechanic_label
            else pattern_label if pattern_label not in ('other', 'static')
            else ''
        )
    else:
        movement_prefix = (
            f"{mechanic_label} {pattern_label}" if mechanic_label
            else pattern_label
        )
    
    muscle_labels = [MUSCLE_LABEL.get(m, m) for m in primary[:3]]
    equipment_suffix = f" with {EQUIPMENT_LABEL.get(equipment[0], equipment[0])}." if equipment and EQUIPMENT_LABEL.get(equipment[0]) else "."
    
    base = (
        f"{movement_prefix} movement targeting {', '.join(muscle_labels)}" if movement_prefix
        else f"Targets {', '.join(muscle_labels)}"
    )
    
    if base:
        base = base[0].upper() + base[1:]
    
    return base + equipment_suffix

test_case = json.loads(sys.argv[1])
result = build_cue(test_case['mechanic'], test_case['pattern'], test_case['primary'], test_case['equipment'])
print(result)
`;

console.log('Testing Python/TS cue parity...\n');

let failures = 0;

for (const tc of testCases) {
  const tsResult = buildCue({
    mechanic: tc.mechanic,
    pattern: tc.pattern,
    primaryMuscles: tc.primary,
    equipment: tc.equipment[0] || null
  });
  
  const pythonResult = spawnSync('python3', ['-c', pythonScript, JSON.stringify(tc)], {
    encoding: 'utf-8'
  });
  
  if (pythonResult.status !== 0) {
    console.error(`❌ Python execution failed for case:`, tc);
    console.error(pythonResult.stderr);
    failures++;
    continue;
  }
  
  const pyOutput = pythonResult.stdout.trim();
  
  if (tsResult !== pyOutput) {
    console.log(`❌ Mismatch for ${tc.pattern}:`);
    console.log(`   TS:     "${tsResult}"`);
    console.log(`   Python: "${pyOutput}"`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n❌ ${failures} parity failures`);
  process.exit(1);
}

console.log(`✅ All ${testCases.length} test cases match between TS and Python\n`);
