/**
 * Steer 3: Test that goblet or box squat leads every past-knee Lower/Legs day when available,
 * and barbell-squat appears only after preferred squats in swap lists.
 */
import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives } from "../src/lib/program/alternatives";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function base(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    userId: "test",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: false,
    equipmentIds: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press"],
    currentInjuryRegions: [],
    anyKneeInjury: true,
    catalogue,
    ...overrides,
  };
}

console.log("Steer 3: Past-knee squat leading and swap ordering");
console.log("─".repeat(60));

console.log("\n1. Goblet or box squat leads every past-knee Lower/Legs day when available");
{
  const equipmentSets = [
    { label: "Gym", hasAll: false, ids: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press"] },
    { label: "Home", hasAll: false, ids: ["dumbbell", "adjustable_bench", "pull_up_bar"] },
    { label: "DB", hasAll: false, ids: ["dumbbell", "adjustable_bench"] },
  ];
  
  const levels: ("beginner" | "intermediate" | "expert")[] = ["beginner", "intermediate", "expert"];
  const dayCounts = [3, 4, 5, 6];
  
  let checked = 0;
  let violations = 0;
  const violationDetails: string[] = [];
  
  for (const equip of equipmentSets) {
    for (const level of levels) {
      for (const days of dayCounts) {
        const input = base({
          level,
          daysPerWeek: days,
          hasAllEquipment: equip.hasAll,
          equipmentIds: equip.ids,
        });
        
        const program = generateProgram(input);
        const byId = new Map(catalogue.map(e => [e.id, e]));
        
        for (const day of program.days) {
          // Skip rest days and non-lower days
          if (day.label.toLowerCase().includes("rest")) continue;
          const isLowerDay = day.label.toLowerCase().includes("leg") || day.label.toLowerCase().includes("lower");
          if (!isLowerDay) continue;
          
          // Find first squat-pattern exercise
          const firstSquat = day.exercises
            .map(ex => byId.get(ex.exerciseId))
            .find(e => e && e.movement_pattern === "squat");
          
          if (firstSquat) {
            checked++;
            
            // Check if goblet or box squat is available in this day
            const daySquats = day.exercises
              .map(ex => byId.get(ex.exerciseId))
              .filter(e => e && e.movement_pattern === "squat");
            const hasGoblet = daySquats.some(e => e && e.slug === "goblet-squat");
            const hasBox = daySquats.some(e => e && e.slug === "box-squat");
            
            // If goblet or box is available, one of them must lead
            if (hasGoblet || hasBox) {
              if (firstSquat.slug !== "goblet-squat" && firstSquat.slug !== "box-squat") {
                violations++;
                if (violationDetails.length < 5) {
                  violationDetails.push(`${equip.label}/${level}/${days}d: ${firstSquat.slug} leads (goblet=${hasGoblet}, box=${hasBox})`);
                }
              }
            } else {
              // If neither goblet nor box available, allow bodyweight-squat or leg-press
              const fallbackSquats = ["bodyweight-squat", "leg-press"];
              if (!fallbackSquats.includes(firstSquat.slug)) {
                violations++;
                if (violationDetails.length < 5) {
                  violationDetails.push(`${equip.label}/${level}/${days}d: ${firstSquat.slug} leads (no goblet/box available)`);
                }
              }
            }
          }
        }
      }
    }
  }
  
  check(`Goblet/box/bodyweight-squat/leg-press leads all past-knee Lower/Legs days`, violations === 0,
    violations > 0 ? `${violations}/${checked} days violated: ${violationDetails.join(", ")}` : `(${checked} days checked)`);
}

console.log("\n2. Barbell-squat appears only after preferred squats in swap lists");
{
  const bodyweightSquat = catalogue.find(e => e.slug === "bodyweight-squat");
  if (!bodyweightSquat) {
    check("bodyweight-squat exists in catalogue", false);
  } else {
    // Get past-knee squat swaps
    const swaps = rankAlternatives(
      bodyweightSquat,
      catalogue.filter(e => e.movement_pattern === "squat"),
      {
        level: "intermediate",
        availableEquipment: null,
        injuryRegions: [],
        anyKneeInjury: true,
        limit: 20,
        scoreFn: (e) => 0,
        tieBreakFn: (slug) => 0,
      }
    );
    
    const barbellSquatIdx = swaps.findIndex(e => e.slug === "barbell-squat");
    const preferredSquats = ["goblet-squat", "box-squat", "bodyweight-squat", "leg-press"];
    const preferredIndices = preferredSquats
      .map(slug => swaps.findIndex(e => e.slug === slug))
      .filter(idx => idx !== -1);
    
    if (barbellSquatIdx === -1) {
      check("Barbell-squat ordering in swaps", true, "barbell-squat not in top 20 swaps");
    } else {
      const allPreferredBeforeBarbell = preferredIndices.every(idx => idx < barbellSquatIdx);
      check("Barbell-squat appears after preferred squats in swaps", allPreferredBeforeBarbell,
        allPreferredBeforeBarbell ? `barbell-squat at ${barbellSquatIdx}, preferred: ${preferredIndices.join(", ")}` :
        `barbell-squat at ${barbellSquatIdx} comes before some preferred squats (${preferredIndices.join(", ")})`);
    }
  }
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
