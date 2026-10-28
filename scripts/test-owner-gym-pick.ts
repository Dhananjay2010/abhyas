/**
 * Test owner-gym pick logic (deterministic owner gym selection)
 */

import assert from "node:assert";
import { pickOwnedGym, checkGymOwnership } from "@/lib/gym/owner-check";
import { createFakeDb, json } from "./helpers/fake-postgrest";

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

console.log();

// Test 8: checkGymOwnership itself (default older + iron-temple newer) picks iron-temple
async function testCheckGymOwnership() {
  console.log("=== Test: checkGymOwnership integration ===\n");
  
  const db = createFakeDb();
  db.beforeRequest = (req) => {
    if (req.table !== "gym_memberships") return;
    assert.strictEqual(req.filters.role, "eq.owner");
    assert.strictEqual(req.filters.status, "eq.active");
    assert.strictEqual(req.limit, null, "FAIL: no limit — all owner rows must be fetched");
    return json(200, [
      { gym_id: "g-default", joined_at: "2024-01-01T00:00:00Z", role: "owner", status: "active", gyms: { name: "Default", slug: "default" } },
      { gym_id: "g-iron", joined_at: "2024-06-01T00:00:00Z", role: "owner", status: "active", gyms: { name: "Iron Temple", slug: "iron-temple" } },
    ]);
  };
  const own = await checkGymOwnership(db.client, "u1");
  assert.strictEqual(own.isOwner, true);
  assert.strictEqual(own.gymSlug, "iron-temple", "FAIL: checkGymOwnership must pick iron-temple");
  assert.strictEqual(own.gymId, "g-iron");
  console.log("✓ checkGymOwnership (default + iron-temple) gives iron-temple");
  
  const empty = createFakeDb();
  empty.beforeRequest = () => json(200, []);
  assert.strictEqual((await checkGymOwnership(empty.client, "u1")).isOwner, false);
  console.log("✓ checkGymOwnership with no owner rows gives isOwner false");
}

testCheckGymOwnership()
  .then(() => {
    console.log("\n✅ All tests passed\n");
  })
  .catch((err) => {
    console.error("Test failed:", err);
    process.exitCode = 1;
  });
