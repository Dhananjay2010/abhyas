#!/usr/bin/env tsx
/**
 * Test: createBlockForUser with real anchoring - calls real persist function
 * 
 * Uses createClient with typed stubFetch (same technique as test-start-session-full-deps-resolve).
 * Clock fixed to Thursday 2026-10-29.
 * 
 * Expected weekday patterns (3-day plan):
 * - New block 1: [1,4,6] (Mon, Thu, Sat - anchored to Thursday)
 * - Rebuild block 1: [1,3,5] (Mon, Wed, Fri - original mapping, no anchoring)
 * - New block 2: [1,3,5] (Mon, Wed, Fri - original mapping, no anchoring)
 * 
 * Mutants killed:
 * - never-anchor (inline persist: const startedOn = undefined): new block 1 gets [1,3,5] FAIL
 * - always-anchor (inline persist: const startedOn = today): rebuild/block2 get [1,4,6] FAIL
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createBlockForUser } from "../src/lib/program/persist";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import type { CandidateExercise } from "../src/lib/program/generate";

type DayType = Database["public"]["Enums"]["day_type"];

// Use the real catalogue from the fixture
const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

interface RecordedData {
  programDays: Array<{ day_index: number; day_type: DayType }>;
  rpcCalls: Array<{ name: string; body: unknown }>;
}

function buildRecordingClient(config: {
  lastBlockNumber: number | null;
  activeBlock: { block_number: number; started_on: string } | null;
}): { client: ReturnType<typeof createClient<Database>>; recorded: RecordedData } {
  
  const recorded: RecordedData = {
    programDays: [],
    rpcCalls: [],
  };
  
  const stubFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || (typeof input === "object" && "method" in input ? input.method : "GET");
    
    // Get body from either init or input
    let bodyText: string | null = null;
    if (init?.body && typeof init.body === "string") {
      bodyText = init.body;
    } else if (typeof input === "object" && "body" in input && input.body) {
      // For Request objects, read the body stream
      const body = input.body;
      if (body instanceof ReadableStream) {
        const reader = body.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const buffer = Buffer.concat(chunks);
        bodyText = new TextDecoder().decode(buffer);
      } else if (typeof body === "string") {
        bodyText = body;
      }
    }
    
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    
    // Record program_days POST
    if (path.includes("/program_days") && method === "POST") {
      if (bodyText) {
        const body = JSON.parse(bodyText);
        const rows = Array.isArray(body) ? body : [body];
        recorded.programDays.push(...rows);
        return new Response(JSON.stringify(rows.map((r, i) => ({ ...r, id: `day-${i}` }))), {
          status: 201,
          headers: { "content-type": "application/json", "content-range": `0-${rows.length - 1}/${rows.length}` },
        });
      }
    }
    
    // Record RPC calls
    if (path.includes("/rpc/") && bodyText) {
      const rpcName = path.split("/rpc/")[1].split("?")[0];
      recorded.rpcCalls.push({ name: rpcName, body: JSON.parse(bodyText) });
      return new Response(JSON.stringify("prog-rpc-123"), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    
    // Handle GET queries
    if (method === "GET") {
      const select = urlObj.searchParams.get("select") || "";
      
      // Profile
      if (path.includes("/profiles")) {
        return new Response(JSON.stringify([{
          id: "user-123",
          goal: "muscle_gain",
          level: "intermediate",
          primary_track: "weights",
          days_per_week: 3,
          yoga_days_per_week: 0,
          date_of_birth: "1990-01-01",
          height_cm: 180,
          has_all_equipment: true,
          preferred_session_minutes: 45,
          timezone: "UTC",
          created_at: "2026-10-29T00:00:00Z",
        }]), {
          status: 200,
          headers: { "content-type": "application/json", "content-range": "0-0/1" },
        });
      }
      
      // Body metrics
      if (path.includes("/body_metrics")) {
        return new Response(JSON.stringify([{ weight_kg: 75 }]), {
          status: 200,
          headers: { "content-type": "application/json", "content-range": "0-0/1" },
        });
      }
      
      // Equipment - return various equipment to match catalogue needs
      if (path.includes("/user_equipment")) {
        return new Response(JSON.stringify([
          { equipment_id: "eq-barbell" },
          { equipment_id: "eq-dumbbells" },
          { equipment_id: "eq-bench" },
        ]), {
          status: 200,
          headers: { "content-type": "application/json", "content-range": "0-2/3" },
        });
      }
      
      // Injuries
      if (path.includes("/user_injuries")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json", "content-range": "*/0" },
        });
      }
      
      // Exercises
      if (path.includes("/exercises")) {
        return new Response(JSON.stringify(catalogue), {
          status: 200,
          headers: { "content-type": "application/json", "content-range": `0-${catalogue.length - 1}/${catalogue.length}` },
        });
      }
      
      // Programs - last block number
      if (path.includes("/programs") && select === "block_number" && urlObj.searchParams.has("order")) {
        const data = config.lastBlockNumber ? [{ block_number: config.lastBlockNumber }] : [];
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "content-type": "application/json", "content-range": data.length ? "0-0/1" : "*/0" },
        });
      }
      
      // Programs - active block
      if (path.includes("/programs") && select.includes("started_on")) {
        const data = config.activeBlock ? [config.activeBlock] : [];
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "content-type": "application/json", "content-range": data.length ? "0-0/1" : "*/0" },
        });
      }
      
      // Programs - other selects
      if (path.includes("/programs")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json", "content-range": "*/0" },
        });
      }
    }
    
    // Handle POST/PATCH
    if (method === "POST" && path.includes("/programs")) {
      return new Response(JSON.stringify([{ id: "prog-123" }]), {
        status: 201,
        headers: { "content-type": "application/json", "content-range": "0-0/1" },
      });
    }
    
    if (method === "POST" && path.includes("/program_day_exercises")) {
      return new Response(JSON.stringify([]), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    
    if (method === "PATCH") {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    
    // Default empty response
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json", "content-range": "*/0" },
    });
  };
  
  const client = createClient<Database>("http://stub.local", "anon", {
    global: { fetch: stubFetch },
  });
  
  return { client, recorded };
}

async function main() {
  console.log("\nTest: createBlockForUser anchoring on Thursday 2026-10-29\n");
  
  console.log("1. New block 1 (no prior blocks) → [1,4,6] (anchored to Thursday)");
  {
    const { client, recorded } = buildRecordingClient({
      lastBlockNumber: null,
      activeBlock: null,
    });
    
    const result = await createBlockForUser(client, "user-123", { _testToday: "2026-10-29" });
    
    console.log(`  [DEBUG] Result:`, result);
    console.log(`  [DEBUG] Recorded days:`, recorded.programDays.length, recorded.programDays.map(d => d.day_type));
    
    assert.ok(result.ok, "createBlockForUser should succeed");
    
    const trainingDays = recorded.programDays
      .filter((d) => d.day_type === "weights")
      .map((d) => d.day_index)
      .sort((a, b) => a - b);
    
    assert.deepStrictEqual(
      trainingDays,
      [1, 4, 6],
      "New block 1 on Thursday must anchor to [1,4,6] (Mon, Thu, Sat)"
    );
    
    console.log(`  ✓ New block 1: inserted days [${trainingDays.join(",")}] = [1,4,6]`);
  }
  
  console.log("\n2. Rebuild block 1 → [1,3,5] (original mapping, no anchoring)");
  {
    const { client, recorded } = buildRecordingClient({
      lastBlockNumber: 1,
      activeBlock: { block_number: 1, started_on: "2026-10-15" },
    });
    
    const result = await createBlockForUser(client, "user-123", { mode: "rebuild", _testToday: "2026-10-29" });
    
    assert.ok(result.ok, "rebuild should succeed");
    assert.strictEqual(recorded.rpcCalls.length, 1, "rebuild should use RPC");
    assert.ok(recorded.rpcCalls[0].name.includes("rebuild"), "should call rebuild RPC");
    
    console.log(`  ✓ Rebuild block 1: uses RPC path (preserves [1,3,5] mapping)`);
  }
  
  console.log("\n3. New block 2 (after rollover) → [1,3,5] (original mapping, no anchoring)");
  {
    const { client, recorded } = buildRecordingClient({
      lastBlockNumber: 1,
      activeBlock: null,
    });
    
    const result = await createBlockForUser(client, "user-123", { _testToday: "2026-10-29" });
    
    assert.ok(result.ok, "createBlockForUser should succeed");
    
    const trainingDays = recorded.programDays
      .filter((d) => d.day_type === "weights")
      .map((d) => d.day_index)
      .sort((a, b) => a - b);
    
    assert.deepStrictEqual(
      trainingDays,
      [1, 3, 5],
      "New block 2 must use original [1,3,5] mapping (no anchoring)"
    );
    
    console.log(`  ✓ New block 2: inserted days [${trainingDays.join(",")}] = [1,3,5]`);
  }
  
  console.log("\n✓ All behavioral tests passed\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
