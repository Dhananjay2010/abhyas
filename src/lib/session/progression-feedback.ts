import { buildProgressionInput } from "./build-progression-input";
import { evaluateProgression, describePersonalBest } from "@/lib/program/progression";
import type { UnitsPreference } from "@/lib/units";

/**
 * progressionFeedback: Build progression input, evaluate it, and describe any PB.
 * 
 * Extracted from actions.ts to enable unit testing the full units flow
 * without mock Supabase clients.
 */
export function progressionFeedback(
  se: Parameters<typeof buildProgressionInput>[0],
  sets: Parameters<typeof buildProgressionInput>[1],
  prior: Parameters<typeof buildProgressionInput>[2],
  session: Parameters<typeof buildProgressionInput>[3],
  feel: Parameters<typeof buildProgressionInput>[4],
  units: UnitsPreference,
) {
  const input = buildProgressionInput(se, sets, prior, session, feel, units);
  const decision = evaluateProgression(input);
  const personalBest = decision.personalBest 
    ? describePersonalBest(decision.personalBest, units)
    : null;
  return { input, decision, personalBest };
}
