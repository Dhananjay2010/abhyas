#!/usr/bin/env tsx
/**
 * Generate correct exercise cues (descriptions) based on movement pattern and mechanic.
 * This script was used to generate cue-fixes.json and the migration SQL.
 */

import { auditCatalogueDescriptions, type DescriptionMismatch } from "./audit-catalogue-descriptions";

type MovementPattern =
  | "horizontal_press"
  | "vertical_press"
  | "horizontal_pull"
  | "vertical_pull"
  | "squat"
  | "hinge"
  | "lunge"
  | "calf"
  | "core"
  | "biceps"
  | "triceps"
  | "lateral_delt"
  | "rear_delt"
  | "forearm"
  | "neck"
  | "carry"
  | "cardio"
  | "other";

type Mechanic = "compound" | "isolation";

interface CueFix {
  slug: string;
  name: string;
  oldCue: string;
  newCue: string;
  pattern: MovementPattern;
  mechanic: Mechanic;
}

/**
 * Generate a correct cue based on pattern and mechanic.
 * Follows the existing style: "{Mechanic} {force} movement targeting {muscle(s)}. {Equipment}."
 */
function generateCorrectCue(
  pattern: MovementPattern,
  mechanic: Mechanic,
  oldCue: string
): string {
  const mechanicStr = mechanic === "compound" ? "Compound" : "Isolation";
  
  // Extract the "targeting X" and equipment parts from the old cue
  const targetMatch = oldCue.match(/targeting ([^.]+)\./);
  const target = targetMatch ? targetMatch[1] : "muscles";
  
  // Extract equipment (everything after the first period)
  const equipMatch = oldCue.match(/\.\s*(.+)$/);
  const equipment = equipMatch ? ` ${equipMatch[1]}` : "";
  
  // Determine the force/movement description based on pattern
  let forceDesc: string;
  
  switch (pattern) {
    case "horizontal_press":
    case "vertical_press":
      forceDesc = "push";
      break;
    
    case "horizontal_pull":
    case "vertical_pull":
    case "biceps":
    case "forearm":
      forceDesc = "pull";
      break;
    
    case "squat":
      forceDesc = "squat";
      break;
    
    case "lunge":
      forceDesc = "lunge";
      break;
    
    case "hinge":
      forceDesc = "hinge";
      break;
    
    case "core":
      forceDesc = "core";
      break;
    
    case "calf":
      forceDesc = "calf";
      break;
    
    case "triceps":
      forceDesc = "triceps";
      break;
    
    case "lateral_delt":
      forceDesc = "lateral raise";
      break;
    
    case "rear_delt":
      forceDesc = "rear delt";
      break;
    
    case "neck":
      forceDesc = "neck";
      break;
    
    case "carry":
      forceDesc = "carry";
      break;
    
    case "cardio":
      forceDesc = "cardio";
      break;
    
    case "other":
      forceDesc = "accessory";
      break;
  }
  
  return `${mechanicStr} ${forceDesc} movement targeting ${target}.${equipment}`;
}

// Generate audit results
const auditResults = auditCatalogueDescriptions();

// Exclude exercises with special handling:
// - back-flyes-with-bands: pattern tag appears wrong, needs retag
// - box-squat, leg-extensions, single-leg-leg-extension: have knee-safe cues from 140600
const exclude = new Set([
  'back-flyes-with-bands',
  'box-squat',
  'leg-extensions',
  'single-leg-leg-extension'
]);

// Process all mismatches
const fixes: CueFix[] = [];

for (const mismatch of auditResults) {
  if (exclude.has(mismatch.slug)) continue;
  
  const newCue = generateCorrectCue(
    mismatch.movement_pattern,
    mismatch.mechanic,
    mismatch.cue
  );
  
  fixes.push({
    slug: mismatch.slug,
    name: mismatch.name,
    oldCue: mismatch.cue,
    newCue,
    pattern: mismatch.movement_pattern,
    mechanic: mismatch.mechanic,
  });
}

// Output as JSON for migration generation
console.log(JSON.stringify(fixes, null, 2));
