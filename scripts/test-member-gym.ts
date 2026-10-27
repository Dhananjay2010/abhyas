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

function createStubFetch(responses: Record<string, unknown>) {
  const calls: FetchCall[] = [];
  
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method || 'GET';
    const body = init?.body ? init.body.toString() : undefined;
    
    calls.push({ url, method, body });
    
    // Parse Postgrest query from URL
    const urlObj = new URL(url);
    const table = urlObj.pathname.split('/').pop();
    
    if (!table || !responses[table]) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify(responses[table]), {
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
    const stub = createStubFetch({
      gym_memberships: [
        {
          gym_id: 'gym-abc',
          role: 'member',
          joined_at: '2024-01-01T00:00:00Z',
          gyms: { name: 'Test Gym' },
        },
      ],
    });
    
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
    const stub = createStubFetch({
      gym_memberships: [], // Empty = no memberships for this user
    });
    
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
    const stub = createStubFetch({
      gym_memberships: [
        {
          gym_id: 'gym-owner',
          role: 'owner',
          joined_at: '2023-01-01T00:00:00Z',
          gyms: { name: 'Owner Gym' },
        },
        {
          gym_id: 'gym-member',
          role: 'member',
          joined_at: '2024-06-01T00:00:00Z',
          gyms: { name: 'Member Gym' },
        },
        {
          gym_id: 'gym-staff',
          role: 'staff',
          joined_at: '2024-03-01T00:00:00Z',
          gyms: { name: 'Staff Gym' },
        },
      ],
    });
    
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
    const stub = createStubFetch({
      gym_memberships: [
        // Ordered by joined_at ascending (oldest first)
        {
          gym_id: 'gym-oldest',
          role: 'staff',
          joined_at: '2023-01-01T00:00:00Z',
          gyms: { name: 'Oldest Gym' },
        },
        {
          gym_id: 'gym-newer',
          role: 'owner',
          joined_at: '2024-06-01T00:00:00Z',
          gyms: { name: 'Newer Gym' },
        },
      ],
    });
    
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
    const stub = createStubFetch({
      gym_memberships: [],
    });
    
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
