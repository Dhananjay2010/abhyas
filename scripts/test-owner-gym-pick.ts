/**
 * Test owner-gym pick logic (deterministic owner gym selection)
 */

import assert from "node:assert";
import { pickOwnedGym } from "@/lib/gym/owner-check";

type GymMembershipRow = {
  gym_id: string;
  joined_at?: string;
  gyms: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

console.log("=== Test: pickOwnedGym ===\n");

// Test 1: no rows gives null
{
  const result = pickOwnedGym([]);
  assert.strictEqual(result, null, "FAIL: empty array should return null");
  console.log("✓ No rows gives null");
}

// Test 2: only default gives default
{
  const rows: GymMembershipRow[] = [
    {
      gym_id: "gym-1",
      joined_at: "2024-01-01T00:00:00Z",
      gyms: { name: "Default Gym", slug: "default" },
    },
  ];
  const result = pickOwnedGym(rows);
  assert.strictEqual(result?.gym_id, "gym-1", "FAIL: should pick the only gym");
  console.log("✓ Only default gives default");
}

// Test 3: default (older) plus iron-temple (newer) gives iron-temple
{
  const rows: GymMembershipRow[] = [
    {
      gym_id: "gym-default",
      joined_at: "2024-01-01T00:00:00Z",
      gyms: { name: "Default Gym", slug: "default" },
    },
    {
      gym_id: "gym-iron",
      joined_at: "2024-02-01T00:00:00Z",
      gyms: { name: "Iron Temple", slug: "iron-temple" },
    },
  ];
  const result = pickOwnedGym(rows);
  assert.strictEqual(result?.gym_id, "gym-iron", "FAIL: should prefer non-default slug");
  console.log("✓ default (older) + iron-temple (newer) gives iron-temple");
}

// Test 4: two non-default gyms give the older one
{
  const rows: GymMembershipRow[] = [
    {
      gym_id: "gym-newer",
      joined_at: "2024-02-01T00:00:00Z",
      gyms: { name: "Newer Gym", slug: "newer-gym" },
    },
    {
      gym_id: "gym-older",
      joined_at: "2024-01-01T00:00:00Z",
      gyms: { name: "Older Gym", slug: "older-gym" },
    },
  ];
  const result = pickOwnedGym(rows);
  assert.strictEqual(result?.gym_id, "gym-older", "FAIL: should pick older joined_at");
  console.log("✓ Two non-default gyms give the older one");
}

// Test 5: two non-default gyms with equal joined_at give the smaller gym_id
{
  const rows: GymMembershipRow[] = [
    {
      gym_id: "gym-z",
      joined_at: "2024-01-01T00:00:00Z",
      gyms: { name: "Gym Z", slug: "gym-z" },
    },
    {
      gym_id: "gym-a",
      joined_at: "2024-01-01T00:00:00Z",
      gyms: { name: "Gym A", slug: "gym-a" },
    },
  ];
  const result = pickOwnedGym(rows);
  assert.strictEqual(result?.gym_id, "gym-a", "FAIL: should pick smaller gym_id");
  console.log("✓ Equal joined_at gives smaller gym_id");
}

// Test 6: default plus non-default in reverse order gives non-default
{
  const rows: GymMembershipRow[] = [
    {
      gym_id: "gym-iron",
      joined_at: "2024-02-01T00:00:00Z",
      gyms: { name: "Iron Temple", slug: "iron-temple" },
    },
    {
      gym_id: "gym-default",
      joined_at: "2024-01-01T00:00:00Z",
      gyms: { name: "Default Gym", slug: "default" },
    },
  ];
  const result = pickOwnedGym(rows);
  assert.strictEqual(result?.gym_id, "gym-iron", "FAIL: order independence - should prefer non-default");
  console.log("✓ Order independence: reverse order still picks non-default");
}

// Test 7: gyms relation as array is handled
{
  const rows: GymMembershipRow[] = [
    {
      gym_id: "gym-1",
      joined_at: "2024-01-01T00:00:00Z",
      gyms: [{ name: "Test Gym", slug: "test-gym" }],
    },
  ];
  const result = pickOwnedGym(rows);
  assert.strictEqual(result?.gym_id, "gym-1", "FAIL: should handle gyms as array");
  console.log("✓ gyms relation as array is handled");
}

console.log("\n✅ All tests passed\n");
