export const MUSCLE_LABEL: Record<string, string> = {
  abs: 'abs',
  obliques: 'obliques',
  lower_back: 'lower back',
  quads: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  chest: 'chest',
  lats: 'lats',
  traps: 'traps',
  shoulders: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  hip_flexors: 'hip flexors',
  adductors: 'adductors',
  abductors: 'abductors',
};

export const EQUIPMENT_LABEL: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  kettlebell: 'Kettlebell',
  resistance_band: 'Bands',
  ez_bar: 'EZ Bar',
  trap_bar: 'Trap Bar',
  smith_machine: 'Smith Machine',
  cable_machine: 'Cable',
  pull_up_bar: 'Pull-up Bar',
  dip_station: 'Dip Station',
  squat_rack: 'Squat Rack',
  leg_press_machine: 'Leg Press',
  leg_curl_machine: 'Leg Curl Machine',
  leg_extension_machine: 'Leg Extension Machine',
  lat_pulldown_machine: 'Lat Pulldown',
  seated_row_machine: 'Seated Row Machine',
  chest_press_machine: 'Chest Press Machine',
  pec_deck_machine: 'Pec Deck',
  shoulder_press_machine: 'Shoulder Press Machine',
  adjustable_bench: 'Bench',
  stability_ball: 'Stability Ball',
  ab_wheel: 'Ab Wheel',
  medicine_ball: 'Medicine Ball',
  foam_roller: 'Foam Roller',
  trx_suspension_trainer: 'TRX',
  battle_ropes: 'Battle Ropes',
  plyo_box: 'Plyo Box',
  glute_ham_developer: 'GHD',
  preacher_curl_bench: 'Preacher Bench',
  calf_raise_machine: 'Calf Machine',
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
    (primaryMuscles.length === 1 && primaryMuscles[0] && patternLabel === MUSCLE_LABEL[primaryMuscles[0]]);
  
  const movementPrefix = skipPattern
    ? mechanicLabel
      ? mechanicLabel
      : patternLabel && patternLabel !== 'other' && patternLabel !== 'static'
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
  
  if (!mechanic && base.length > 0) {
    base = base.charAt(0).toUpperCase() + base.slice(1);
  }
  
  return base + equipmentSuffix;
}
