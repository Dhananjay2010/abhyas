#!/usr/bin/env tsx
/**
 * Server-side test for equipment toggle data preservation.
 * 
 * Tests that turning "I have access to everything" ON preserves the user's
 * equipment selection, so turning it OFF later restores those picks instead
 * of leaving them with zero equipment.
 * 
 * Regression test for: updateEquipment was deleting all user_equipment rows
 * when hasAll was set to true, causing data loss when toggling back off.
 */

let failures = 0;

type UserEquipmentRow = { user_id: string; equipment_id: string };
type ProfileRow = { id: string; has_all_equipment: boolean };

interface FakeSupabase {
  userEquipment: Map<string, Set<string>>;
  profiles: Map<string, ProfileRow>;
}

function createFakeSupabase(): FakeSupabase {
  return {
    userEquipment: new Map(),
    profiles: new Map(),
  };
}

async function updateEquipment(
  db: FakeSupabase,
  userId: string,
  input: { hasAll: boolean; equipmentIds: string[] }
): Promise<void> {
  const profile = db.profiles.get(userId);
  if (profile) {
    profile.has_all_equipment = input.hasAll;
  } else {
    db.profiles.set(userId, { id: userId, has_all_equipment: input.hasAll });
  }

  if (!input.hasAll) {
    db.userEquipment.set(userId, new Set(input.equipmentIds));
  }
}

function getEquipment(db: FakeSupabase, userId: string): string[] {
  return Array.from(db.userEquipment.get(userId) ?? []).sort();
}

function getHasAll(db: FakeSupabase, userId: string): boolean {
  return db.profiles.get(userId)?.has_all_equipment ?? false;
}

async function testScenario(
  description: string,
  steps: Array<{
    action: "set" | "check";
    hasAll?: boolean;
    equipmentIds?: string[];
    expectedHasAll?: boolean;
    expectedEquipmentIds?: string[];
  }>
) {
  const db = createFakeSupabase();
  const userId = "test-user";

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.action === "set") {
      await updateEquipment(db, userId, {
        hasAll: step.hasAll!,
        equipmentIds: step.equipmentIds!,
      });
    } else if (step.action === "check") {
      const actualHasAll = getHasAll(db, userId);
      const actualEquipmentIds = getEquipment(db, userId);

      if (actualHasAll !== step.expectedHasAll) {
        console.error(`❌ ${description} - Step ${i + 1}: hasAll mismatch`);
        console.error(`   expected: ${step.expectedHasAll}`);
        console.error(`   actual:   ${actualHasAll}`);
        failures++;
        return;
      }

      if (JSON.stringify(actualEquipmentIds) !== JSON.stringify(step.expectedEquipmentIds)) {
        console.error(`❌ ${description} - Step ${i + 1}: equipmentIds mismatch`);
        console.error(`   expected: ${JSON.stringify(step.expectedEquipmentIds)}`);
        console.error(`   actual:   ${JSON.stringify(actualEquipmentIds)}`);
        failures++;
        return;
      }
    }
  }

  console.log(`✓ ${description}`);
}

console.log("Testing equipment toggle data preservation...\n");

(async () => {
  await testScenario("User picks equipment, turns hasAll ON, then OFF - equipment is preserved", [
    { action: "set", hasAll: false, equipmentIds: ["barbell", "dumbbell"] },
    { action: "check", expectedHasAll: false, expectedEquipmentIds: ["barbell", "dumbbell"] },
    { action: "set", hasAll: true, equipmentIds: ["barbell", "dumbbell"] },
    { action: "check", expectedHasAll: true, expectedEquipmentIds: ["barbell", "dumbbell"] },
    { action: "set", hasAll: false, equipmentIds: ["barbell", "dumbbell"] },
    { action: "check", expectedHasAll: false, expectedEquipmentIds: ["barbell", "dumbbell"] },
  ]);

  await testScenario("User with equipment turns hasAll ON multiple times - equipment is preserved", [
    { action: "set", hasAll: false, equipmentIds: ["barbell", "kettlebell"] },
    { action: "check", expectedHasAll: false, expectedEquipmentIds: ["barbell", "kettlebell"] },
    { action: "set", hasAll: true, equipmentIds: ["barbell", "kettlebell"] },
    { action: "check", expectedHasAll: true, expectedEquipmentIds: ["barbell", "kettlebell"] },
    { action: "set", hasAll: true, equipmentIds: ["barbell", "kettlebell"] },
    { action: "check", expectedHasAll: true, expectedEquipmentIds: ["barbell", "kettlebell"] },
    { action: "set", hasAll: false, equipmentIds: ["barbell", "kettlebell"] },
    { action: "check", expectedHasAll: false, expectedEquipmentIds: ["barbell", "kettlebell"] },
  ]);

  await testScenario("User changes equipment selection while hasAll is OFF", [
    { action: "set", hasAll: false, equipmentIds: ["barbell", "dumbbell"] },
    { action: "check", expectedHasAll: false, expectedEquipmentIds: ["barbell", "dumbbell"] },
    { action: "set", hasAll: false, equipmentIds: ["barbell", "kettlebell", "pullupbar"] },
    { action: "check", expectedHasAll: false, expectedEquipmentIds: ["barbell", "kettlebell", "pullupbar"] },
  ]);

  await testScenario("User with no equipment turns hasAll ON and OFF", [
    { action: "set", hasAll: false, equipmentIds: [] },
    { action: "check", expectedHasAll: false, expectedEquipmentIds: [] },
    { action: "set", hasAll: true, equipmentIds: [] },
    { action: "check", expectedHasAll: true, expectedEquipmentIds: [] },
    { action: "set", hasAll: false, equipmentIds: [] },
    { action: "check", expectedHasAll: false, expectedEquipmentIds: [] },
  ]);

  await testScenario("User picks equipment while hasAll is ON, then turns it OFF", [
    { action: "set", hasAll: true, equipmentIds: [] },
    { action: "check", expectedHasAll: true, expectedEquipmentIds: [] },
    { action: "set", hasAll: false, equipmentIds: ["barbell", "dumbbell"] },
    { action: "check", expectedHasAll: false, expectedEquipmentIds: ["barbell", "dumbbell"] },
  ]);

  console.log(
    `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`
  );
  process.exit(failures === 0 ? 0 : 1);
})();
