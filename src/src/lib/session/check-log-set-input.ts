/**
 * Core validation logic for logSet action.
 * Extracted for testing with injected client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateSet } from "./validation";
import { getProfileUnits } from "@/lib/get-profile-units";

export async function checkLogSetInput(
  client: SupabaseClient,
  userId: string,
  input: {
    reps: number | null;
    weightKg: number | null;
    durationSeconds?: number | null;
  }
): Promise<string | null> {
  const units = await getProfileUnits(client, userId);
  const durationSeconds = input.durationSeconds ?? null;
  return validateSet(input.reps, input.weightKg, durationSeconds, units);
}
