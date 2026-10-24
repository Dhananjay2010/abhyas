export const MUSCLE_LABEL: Record<string, string> = {
  abs: 'abs',
  obliques: 'obliques',
  lower_back: 'lower back',
  upper_back: 'upper back',
  quads: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  chest: 'chest',
  lats: 'lats',
  traps: 'traps',
  shoulders: 'shoulders',
  front_delts: 'front delts',
  side_delts: 'side delts',
  rear_delts: 'rear delts',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  hip_flexors: 'hip flexors',
  adductors: 'adductors',
  abductors: 'abductors',
  neck: 'neck',
};

export const EQUIPMENT_LABEL: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  cable_machine: 'Cable',
  kettlebell: 'Kettlebell',
  resistance_band: 'Bands',
  ez_bar: 'EZ Bar',
  machine_generic: 'Machine',
  leg_press: 'Leg Press',
  hack_squat: 'Hack Squat',
  leg_curl: 'Leg Curl Machine',
  leg_extension: 'Leg Extension Machine',
  lat_pulldown: 'Lat Pulldown',
  pec_deck: 'Pec Deck',
  chest_press_machine: 'Chest Press Machine',
  seated_row_machine: 'Seated Row Machine',
  smith_machine: 'Smith Machine',
  pull_up_bar: 'Pull-up Bar',
  dip_bars: 'Dip Station',
  flat_bench: 'Bench',
  adjustable_bench: 'Bench',
  squat_rack: 'Squat Rack',
  medicine_ball: 'Medicine Ball',
  stability_ball: 'Stability Ball',
  foam_roller: 'Foam Roller',
  jump_rope: 'Jump Rope',
  ab_wheel: 'Ab Wheel',
};

interface BuildCueParams {
  mechanic: string | null;
  pattern: string | null;
  primaryMuscles: string[];
  equipment: string | null;
}

export function buildCue(params: BuildCueParams): string {
  const { mechanic, pattern, primaryMuscles, equipment } = params;
  
  const mechanicLabel = mechanic ?? '';
  const patternLabel = pattern ? pattern.replace(/_/g, ' ') : '';
  
  const skipPattern =
    !patternLabel ||
    patternLabel === 'other' ||
    patternLabel === 'static' ||
    patternLabel === 'cardio' ||
    (primaryMuscles.length === 1 && primaryMuscles[0] && patternLabel === MUSCLE_LABEL[primaryMuscles[0]]);
  
  const movementPrefix = skipPattern
    ? mechanicLabel
      ? mechanicLabel
      : patternLabel && patternLabel !== 'other' && patternLabel !== 'static' && patternLabel !== 'cardio'
      ? patternLabel
      : ''
    : mechanicLabel
    ? `${mechanicLabel} ${patternLabel}`
    : patternLabel;
  
  const muscleLabels = primaryMuscles
    .slice(0, 3)
    .map(m => MUSCLE_LABEL[m] || m);
  
  const equipmentSuffix = equipment && EQUIPMENT_LABEL[equipment]
    ? ` with ${EQUIPMENT_LABEL[equipment]}.`
    : '.';
  
  let base = movementPrefix
    ? `${movementPrefix} movement targeting ${muscleLabels.join(', ')}`
    : `Targets ${muscleLabels.join(', ')}`;
  
  if (base.length > 0) {
    base = base.charAt(0).toUpperCase() + base.slice(1);
  }
  
  return base + equipmentSuffix;
}
