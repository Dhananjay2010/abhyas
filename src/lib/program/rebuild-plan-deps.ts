/**
 * Builder for rebuildPlanCore dependencies from a Supabase client.
 * This bridges the testable core with the real database.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ensureCurrentBlock } from "./rollover";
import { createBlockForUser } from "./persist";
import type { RebuildPlanDeps } from "./rebuild-plan-core";

/**
 * Build deps with explicit today for testing.
 */
export function buildRebuildPlanDeps(
  supabase: SupabaseClient<Database>,
  userId: string,
  today: string
): RebuildPlanDeps {
  return {
    userId,
    today,

    async fetchActiveBlock() {
      const { data, error } = await supabase
        .from("programs")
        .select("id, ends_on")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to fetch active block: ${error.message}`);
      }
      return data;
    },

    async ensureCurrentBlock(activeBlock) {
      return await ensureCurrentBlock(supabase, userId, today, activeBlock);
    },

    async createBlock() {
      const result = await createBlockForUser(supabase, userId, { mode: "rebuild", today });
      return result;
    },
  };
}
