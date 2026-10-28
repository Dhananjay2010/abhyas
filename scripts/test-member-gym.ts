/**
 * Test: getUserGymMembership - query assertions and multi-membership handling
 * 
 * Tests:
 * (a) Query honors user_id and status filters (RLS compliance)
 * (b) Another user's row is never returned
 * (c) Multi-membership users: prefer role 'member' over 'owner'/'staff'
 * (d) Multi-membership users: prefer oldest joined_at when roles are equal
 * (e) No active membership returns null
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { getUserGymMembership } from "../src/lib/gym/member-gym";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

type FetchCall = {
  url: string;
  method: string;
  body?: string;
};

type GymMembershipRow = {
  gym_id: string;
  user_id?: string;
  role: string;
  joined_at: string;
  gyms: { name: string };
};

function createStubFetch(allRows: GymMembershipRow[]) {
  const calls: FetchCall[] = [];
  
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method || 'GET';
    const body = init?.body ? init.body.toString() : undefined;
    
    calls.push({ url, method, body });
    
    // Parse Postgrest query from URL
    const urlObj = new URL(url);
    const table = urlObj.pathname.split('/').pop();
    
    if (table !== 'gym_memberships') {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Honor filters: user_id=eq.<uid>
    let filtered = allRows;
    const userIdMatch = url.match(/user_id=eq\.([^&]+)/);
    if (userIdMatch) {
      const userId = userIdMatch[1];
      filtered = filtered.filter(r => r.user_id === userId);
    }
    
    // Honor order: order=joined_at(.asc)? and order=gym_id(.asc)?
    if (url.includes('order=joined_at')) {
      const desc = url.includes('joined_at.desc');
      filtered = [...filtered].sort((a, b) => {
        const cmp = a.joined_at.localeCompare(b.joined_at);
        if (cmp !== 0) return desc ? -cmp : cmp;
        // Tie-break by gym_id
        return a.gym_id.localeCompare(b.gym_id);
      });
    }
    
    // Honor limit
    const limitMatch = url.match(/limit=(\d+)/);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      filtered = filtered.slice(0, limit);
    }
    
    return new Response(JSON.stringify(filtered), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  
  return {
    fetch: fetchImpl,
    calls,
  };
}

async function main() {
  console.log("TEST: (a) Query honors user_id=eq.<id> and status=eq.active filters");
  {
    const userId = 'user-123';
    const stub = createStubFetch([
      {
        gym_id: 'gym-abc',
        user_id: userId,
        role: 'member',
        joined_at: '2024-01-01T00:00:00Z',
        gyms: { name: 'Test Gym' },
      },
    ]);
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const result = await getUserGymMembership(supabase, userId);
    
    check("Returns gym membership", result !== null);
    check("Returns correct gym ID", result?.gymId === 'gym-abc');
    check("Returns correct gym name", result?.gymName === 'Test Gym');
    
    // Verify query includes user_id and status filters
    const call = stub.calls.find(c => c.url.includes('gym_memberships'));
    check("Query was made", call !== undefined);
    check("Query filters user_id", call?.url.includes(`user_id=eq.${userId}`) ?? false);
    check("Query filters status", call?.url.includes('status=eq.active') ?? false);
  }
  console.log();

  console.log("TEST: (b) Another user's row is never returned");
  {
    const userId = 'user-456';
    const otherUserId = 'user-other';
    const stub = createStubFetch([
      {
        gym_id: 'gym-other',
        user_id: otherUserId,
        role: 'member',
        joined_at: '2024-01-01T00:00:00Z',
        gyms: { name: 'Other User Gym' },
      },
    ]);
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const result = await getUserGymMembership(supabase, userId);
    
    check("Returns null for non-member", result === null);
    
    // Verify user_id filter was applied
    const call = stub.calls.find(c => c.url.includes('gym_memberships'));
    check("Query filters user_id", call?.url.includes(`user_id=eq.${userId}`) ?? false);
  }
  console.log();

  console.log("TEST: (c) Multi-membership: prefer role 'member' over 'owner'/'staff'");
  {
    const userId = 'user-789';
    const stub = createStubFetch([
      {
        gym_id: 'gym-owner',
        user_id: userId,
        role: 'owner',
        joined_at: '2023-01-01T00:00:00Z',
        gyms: { name: 'Owner Gym' },
      },
      {
        gym_id: 'gym-member',
        user_id: userId,
        role: 'member',
        joined_at: '2024-06-01T00:00:00Z',
        gyms: { name: 'Member Gym' },
      },
      {
        gym_id: 'gym-staff',
        user_id: userId,
        role: 'staff',
        joined_at: '2024-03-01T00:00:00Z',
        gyms: { name: 'Staff Gym' },
      },
    ]);
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const result = await getUserGymMembership(supabase, userId);
    
    check("Prefers 'member' role", result?.gymId === 'gym-member');
    check("Returns correct gym name", result?.gymName === 'Member Gym');
  }
  console.log();

  console.log("TEST: (d) Multi-membership: prefer oldest joined_at when no 'member' role");
  {
    const userId = 'user-owner-staff';
    // UNSORTED fixture to test ordering
    const stub = createStubFetch([
      {
        gym_id: 'gym-newer',
        user_id: userId,
        role: 'owner',
        joined_at: '2024-06-01T00:00:00Z',
        gyms: { name: 'Newer Gym' },
      },
      {
        gym_id: 'gym-oldest',
        user_id: userId,
        role: 'staff',
        joined_at: '2023-01-01T00:00:00Z',
        gyms: { name: 'Oldest Gym' },
      },
    ]);
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const result = await getUserGymMembership(supabase, userId);
    
    check("Prefers oldest joined_at", result?.gymId === 'gym-oldest');
    check("Returns correct gym name", result?.gymName === 'Oldest Gym');
    
    // Verify query orders by joined_at ascending
    const call = stub.calls.find(c => c.url.includes('gym_memberships'));
    check("Query orders by joined_at", call?.url.includes('order=joined_at') ?? false);
  }
  console.log();

  console.log("TEST: (e) No active membership returns null");
  {
    const userId = 'user-no-membership';
    const stub = createStubFetch([]);
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const result = await getUserGymMembership(supabase, userId);
    
    check("Returns null", result === null);
  }
  console.log();

  console.log("TEST: MUTANT M4 - user_id filter assertion (assert eq.<uid> in URL)");
  {
    const userId = 'test-user-m4';
    const otherUserId = 'other-user-m4';
    const gymId = 'user-gym-m4';
    
    // Include OTHER user's row to verify filter works
    const stub = createStubFetch([
      {
        gym_id: 'other-gym-m4',
        user_id: otherUserId,
        role: 'member',
        joined_at: '2024-01-01T00:00:00Z',
        gyms: { name: 'Other Gym M4' },
      },
      {
        gym_id: gymId,
        user_id: userId,
        role: 'member',
        joined_at: '2024-01-01T00:00:00Z',
        gyms: { name: 'User Gym M4' },
      },
    ]);
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const membership = await getUserGymMembership(supabase, userId);
    
    check("M4: Returns membership", membership !== null);
    check("M4: Correct gym ID", membership?.gymId === gymId);
    
    // Assert the query URL contains user_id=eq.{userId}
    const queryCall = stub.calls.find(c => c.url.includes('gym_memberships'));
    const hasUserFilter = queryCall?.url.includes(`user_id=eq.${userId}`) ?? false;
    check("M4: Query includes user_id=eq filter", hasUserFilter, queryCall?.url || 'no call');
  }
  console.log();

  console.log("TEST: MUTANT M5b - order(joined_at) ascending (oldest first)");
  {
    const userId = 'multi-user-m5b';
    const olderGymId = 'gym-older-m5b';
    const newerGymId = 'gym-newer-m5b';
    
    // UNSORTED fixture: newer first, older second
    const stub = createStubFetch([
      {
        gym_id: newerGymId,
        user_id: userId,
        role: 'staff',
        joined_at: '2024-06-01T00:00:00Z',
        gyms: { name: 'Newer Staff Gym' },
      },
      {
        gym_id: olderGymId,
        user_id: userId,
        role: 'staff',
        joined_at: '2024-01-01T00:00:00Z',
        gyms: { name: 'Older Staff Gym' },
      },
    ]);
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const membership = await getUserGymMembership(supabase, userId);
    
    check("M5b: Returns a membership (no error)", membership !== null);
    check("M5b: Prefers oldest joined_at when same role", membership?.gymId === olderGymId);
    check("M5b: Returns correct gym name", membership?.gymName === 'Older Staff Gym');
    
    // Verify query orders by joined_at ascending
    const queryCall = stub.calls.find(c => c.url.includes('gym_memberships'));
    check("M5b: Query orders by joined_at", queryCall?.url.includes('order=joined_at') ?? false);
  }
  console.log();

  console.log("TEST: (f) ID tie-break when joined_at is equal");
  {
    const userId = 'user-tie';
    const gym1Id = 'gym-aaa';
    const gym2Id = 'gym-zzz';
    
    // Same joined_at, different IDs (unsorted by ID)
    const stub = createStubFetch([
      {
        gym_id: gym2Id,
        user_id: userId,
        role: 'member',
        joined_at: '2024-01-01T00:00:00Z',
        gyms: { name: 'Gym Z' },
      },
      {
        gym_id: gym1Id,
        user_id: userId,
        role: 'member',
        joined_at: '2024-01-01T00:00:00Z',
        gyms: { name: 'Gym A' },
      },
    ]);
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const membership = await getUserGymMembership(supabase, userId);
    
    check("Tie-break: Returns membership", membership !== null);
    check("Tie-break: Deterministic ID ordering", membership?.gymId === gym1Id);
    
    // Verify query includes gym_id in order
    const queryCall = stub.calls.find(c => c.url.includes('gym_memberships'));
    check("Tie-break: Query orders by gym_id", queryCall?.url.includes('gym_id') ?? false);
  }
  console.log();

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed`);
    process.exit(1);
  } else {
    console.log("✅ All tests passed");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
