#!/usr/bin/env tsx

/**
 * Test: Membership tier preference (P0 bug fix)
 *
 * Bug: Migration 035 gives every signup a 'member' row in the default gym,
 * so owners see default brand instead of their gym's brand.
 *
 * Fix: Membership preference:
 * 1. role='member' in a NON-default gym (joined_at ASC, gym_id ASC)
 * 2. role='owner' or 'staff' in NON-default gym (joined_at ASC, gym_id ASC)
 * 3. Any membership in default gym (fallback)
 *
 * Tests use real createClient with recording stubFetch that honors filters/order:
 * (a) Owner with auto default member row + owner row in gym X → gets X
 * (b) Code-joined member with default auto row + member row in Y → gets Y
 * (c) Plain signup with only default row → gets default
 * (d) Two owner rows, oldest joined_at wins, gym_id breaks tie
 *
 * Mutants (each with pasted NAMED failure, then reverted):
 * - M1: Don't exclude default (members prefer default over owner rows)
 *       FAIL (a) Returns gym X (owner row), not default
 *       FAIL (a) Gym name is Iron Temple
 *       FAIL (b) Returns gym Y (non-default member row)
 *       FAIL (b) Gym name is FitCore
 *       FAIL (d) Returns gym-a-id (gym_id ASC breaks tie)
 *       FAIL (d) Gym name is Gym A
 *       FAIL (d2) Returns gym-old-id (oldest joined_at)
 *       FAIL (d2) Gym name is Old Gym
 *       (8 failures total when slug !== "default" check removed from tier 1)
 *
 * - M2: Members don't come before owners (owner rows picked first)
 *       FAIL (M2) Returns gym-y-id (member tier wins over owner tier)
 *       FAIL (M2) Gym name is Gym Y
 *       (2 failures when tier 1 = owners, tier 2 = members)
 *
 * - M3: Order newest-first (wrong row when multiple non-default exist)
 *       FAIL (d) Returns gym-a-id (gym_id ASC breaks tie)
 *       FAIL (d) Gym name is Gym A
 *       FAIL (d2) Returns gym-old-id (oldest joined_at)
 *       FAIL (d2) Gym name is Old Gym
 *       (4 failures when order changed to joined_at DESC, gym_id DESC)
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { getUserGymMembership } from "../src/lib/gym/member-gym";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

type GymMembershipRow = {
  gym_id: string;
  user_id: string;
  role: "owner" | "staff" | "member";
  status: "active" | "removed";
  joined_at: string;
  gyms: { name: string; slug: string };
};

type FetchCall = {
  url: string;
  method: string;
  body?: string;
};

function createStubFetch(memberships: GymMembershipRow[]) {
  const calls: FetchCall[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method || "GET";
    const body = init?.body ? init.body.toString() : undefined;

    calls.push({ url, method, body });

    // Parse query params from URL
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    // Check if it's a gym_memberships query
    if (!url.includes("/gym_memberships")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Filter by user_id
    const userIdFilter = params.get("user_id");
    let filtered = memberships;
    if (userIdFilter && userIdFilter.startsWith("eq.")) {
      const userId = userIdFilter.slice(3);
      filtered = filtered.filter((m) => m.user_id === userId);
    }

    // Filter by status
    const statusFilter = params.get("status");
    if (statusFilter && statusFilter.startsWith("eq.")) {
      const status = statusFilter.slice(3);
      filtered = filtered.filter((m) => m.status === status);
    }

    // Apply ordering
    const orderParam = params.get("order");
    if (orderParam) {
      const orders = orderParam.split(",");
      filtered = [...filtered].sort((a, b) => {
        for (const order of orders) {
          const [field, direction] = order.split(".");
          const asc = direction !== "desc";

          let aVal: string | undefined;
          let bVal: string | undefined;

          if (field === "joined_at") {
            aVal = a.joined_at;
            bVal = b.joined_at;
          } else if (field === "gym_id") {
            aVal = a.gym_id;
            bVal = b.gym_id;
          }

          if (aVal !== undefined && bVal !== undefined) {
            if (aVal < bVal) return asc ? -1 : 1;
            if (aVal > bVal) return asc ? 1 : -1;
          }
        }
        return 0;
      });
    }

    return new Response(JSON.stringify(filtered), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return {
    fetch: fetchImpl,
    calls,
  };
}

async function main() {
  console.log("TEST (a): Owner with auto default member row + owner row in gym X → gets X");
  {
    const memberships: GymMembershipRow[] = [
      {
        gym_id: "default-gym-id",
        user_id: "user1",
        role: "member",
        status: "active",
        joined_at: "2026-01-01T00:00:00Z",
        gyms: { name: "Abhyas", slug: "default" },
      },
      {
        gym_id: "gym-x-id",
        user_id: "user1",
        role: "owner",
        status: "active",
        joined_at: "2026-01-02T00:00:00Z",
        gyms: { name: "Iron Temple", slug: "iron-temple" },
      },
    ];

    const stub = createStubFetch(memberships);
    const client = createClient<Database>("http://fake.local", "anon", {
      auth: { persistSession: false },
      global: { fetch: stub.fetch },
    });

    const result = await getUserGymMembership(client, "user1");

    check("(a) Returns non-null", result !== null);
    check("(a) Returns gym X (owner row), not default", result?.gymId === "gym-x-id");
    check("(a) Gym name is Iron Temple", result?.gymName === "Iron Temple");
  }

  console.log("\nTEST (b): Code-joined member with default auto row + member row in Y → gets Y");
  {
    const memberships: GymMembershipRow[] = [
      {
        gym_id: "default-gym-id",
        user_id: "user2",
        role: "member",
        status: "active",
        joined_at: "2026-01-01T00:00:00Z",
        gyms: { name: "Abhyas", slug: "default" },
      },
      {
        gym_id: "gym-y-id",
        user_id: "user2",
        role: "member",
        status: "active",
        joined_at: "2026-01-03T00:00:00Z",
        gyms: { name: "FitCore", slug: "fitcore" },
      },
    ];

    const stub = createStubFetch(memberships);
    const client = createClient<Database>("http://fake.local", "anon", {
      auth: { persistSession: false },
      global: { fetch: stub.fetch },
    });

    const result = await getUserGymMembership(client, "user2");

    check("(b) Returns non-null", result !== null);
    check("(b) Returns gym Y (non-default member row)", result?.gymId === "gym-y-id");
    check("(b) Gym name is FitCore", result?.gymName === "FitCore");
  }

  console.log("\nTEST (c): Plain signup with only default row → gets default");
  {
    const memberships: GymMembershipRow[] = [
      {
        gym_id: "default-gym-id",
        user_id: "user3",
        role: "member",
        status: "active",
        joined_at: "2026-01-01T00:00:00Z",
        gyms: { name: "Abhyas", slug: "default" },
      },
    ];

    const stub = createStubFetch(memberships);
    const client = createClient<Database>("http://fake.local", "anon", {
      auth: { persistSession: false },
      global: { fetch: stub.fetch },
    });

    const result = await getUserGymMembership(client, "user3");

    check("(c) Returns non-null", result !== null);
    check("(c) Returns default gym", result?.gymId === "default-gym-id");
    check("(c) Gym name is Abhyas", result?.gymName === "Abhyas");
  }

  console.log("\nTEST (d): Two owner rows, oldest joined_at wins, gym_id breaks tie");
  {
    // Scenario: user owns two gyms, same joined_at, gym_id breaks tie
    const memberships: GymMembershipRow[] = [
      {
        gym_id: "default-gym-id",
        user_id: "user4",
        role: "member",
        status: "active",
        joined_at: "2026-01-01T00:00:00Z",
        gyms: { name: "Abhyas", slug: "default" },
      },
      {
        gym_id: "gym-z-id",
        user_id: "user4",
        role: "owner",
        status: "active",
        joined_at: "2026-01-05T00:00:00Z",
        gyms: { name: "Gym Z", slug: "gym-z" },
      },
      {
        gym_id: "gym-a-id",
        user_id: "user4",
        role: "owner",
        status: "active",
        joined_at: "2026-01-05T00:00:00Z", // Same joined_at as gym-z
        gyms: { name: "Gym A", slug: "gym-a" },
      },
    ];

    const stub = createStubFetch(memberships);
    const client = createClient<Database>("http://fake.local", "anon", {
      auth: { persistSession: false },
      global: { fetch: stub.fetch },
    });

    const result = await getUserGymMembership(client, "user4");

    check("(d) Returns non-null", result !== null);
    check(
      "(d) Returns gym-a-id (gym_id ASC breaks tie)",
      result?.gymId === "gym-a-id"
    );
    check("(d) Gym name is Gym A", result?.gymName === "Gym A");
  }

  console.log("\nTEST (d2): Two owner rows, oldest joined_at wins (no tie)");
  {
    const memberships: GymMembershipRow[] = [
      {
        gym_id: "default-gym-id",
        user_id: "user5",
        role: "member",
        status: "active",
        joined_at: "2026-01-01T00:00:00Z",
        gyms: { name: "Abhyas", slug: "default" },
      },
      {
        gym_id: "gym-new-id",
        user_id: "user5",
        role: "owner",
        status: "active",
        joined_at: "2026-01-10T00:00:00Z",
        gyms: { name: "New Gym", slug: "new-gym" },
      },
      {
        gym_id: "gym-old-id",
        user_id: "user5",
        role: "owner",
        status: "active",
        joined_at: "2026-01-02T00:00:00Z", // Older
        gyms: { name: "Old Gym", slug: "old-gym" },
      },
    ];

    const stub = createStubFetch(memberships);
    const client = createClient<Database>("http://fake.local", "anon", {
      auth: { persistSession: false },
      global: { fetch: stub.fetch },
    });

    const result = await getUserGymMembership(client, "user5");

    check("(d2) Returns non-null", result !== null);
    check("(d2) Returns gym-old-id (oldest joined_at)", result?.gymId === "gym-old-id");
    check("(d2) Gym name is Old Gym", result?.gymName === "Old Gym");
  }

  console.log("\nTEST (M2): Member in non-default gym Y + owner in gym Z → member wins");
  {
    // This test catches mutant M2: if owners come before members, it returns Z
    const memberships: GymMembershipRow[] = [
      {
        gym_id: "default-gym-id",
        user_id: "user6",
        role: "member",
        status: "active",
        joined_at: "2026-01-01T00:00:00Z",
        gyms: { name: "Abhyas", slug: "default" },
      },
      {
        gym_id: "gym-y-id",
        user_id: "user6",
        role: "member",
        status: "active",
        joined_at: "2026-01-05T00:00:00Z",
        gyms: { name: "Gym Y", slug: "gym-y" },
      },
      {
        gym_id: "gym-z-id",
        user_id: "user6",
        role: "owner",
        status: "active",
        joined_at: "2026-01-03T00:00:00Z", // Earlier than member row
        gyms: { name: "Gym Z", slug: "gym-z" },
      },
    ];

    const stub = createStubFetch(memberships);
    const client = createClient<Database>("http://fake.local", "anon", {
      auth: { persistSession: false },
      global: { fetch: stub.fetch },
    });

    const result = await getUserGymMembership(client, "user6");

    check("(M2) Returns non-null", result !== null);
    check(
      "(M2) Returns gym-y-id (member tier wins over owner tier)",
      result?.gymId === "gym-y-id"
    );
    check("(M2) Gym name is Gym Y", result?.gymName === "Gym Y");
  }

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed`);
    process.exit(1);
  }

  console.log("\n✅ All membership tier tests passed");
  console.log("\nP0: Owners with default member rows now see their gym's brand.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
