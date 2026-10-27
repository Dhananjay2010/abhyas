/**
 * Builder for rebuildPlanCore dependencies from a Supabase client.
 * This bridges the testable core with the real database.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ensureCurrentBlock } from "./rollover";
import { createBlockForUser } from "./persist";
import type { RebuildPlanDeps } from "./rebuild-plan-core";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { localDateString } from "@/lib/dates";

export function buildRebuildPlanDeps(
  supabase: SupabaseClient<Database>,
  userId: string
): RebuildPlanDeps {
  return {
    userId,
    get today() {
      // Lazy evaluation to allow tests to override time
      throw new Error("today must be set explicitly");
    },

    async fetchActiveBlock() {
      const { data } = await supabase
        .from("programs")
        .select("id, ends_on")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },

    async ensureCurrentBlock(activeBlock) {
      // Get timezone to compute today
      const profileRes = await supabase
        .from("profiles")
        .select("timezone")
        .eq("id", userId)
        .single();
      
      const timezone = resolveTimezoneWithProfile(profileRes.data?.timezone);
      const today = localDateString(timezone);
      
      return await ensureCurrentBlock(supabase, userId, today, activeBlock);
    },

    async createBlock() {
      const result = await createBlockForUser(supabase, userId, { mode: "rebuild" });
      return result;
    },
  };
}

/**
 * Build deps with explicit today override for testing.
 */
export function buildRebuildPlanDepsWithToday(
  supabase: SupabaseClient<Database>,
  userId: string,
  today: string
): RebuildPlanDeps {
  return {
    userId,
    today,

    async fetchActiveBlock() {
      const { data } = await supabase
        .from("programs")
        .select("id, ends_on")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },

    async ensureCurrentBlock(activeBlock) {
      return await ensureCurrentBlock(supabase, userId, today, activeBlock);
    },

    async createBlock() {
      const result = await createBlockForUser(supabase, userId, { mode: "rebuild" });
      return result;
    },
  };
}
