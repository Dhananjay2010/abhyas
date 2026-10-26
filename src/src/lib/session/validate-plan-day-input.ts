/**
 * Validate planDay input at runtime.
 * 
 * Returns null if valid, or an error message if invalid.
 */
export function validatePlanDayInput(plan: unknown): string | null {
  if (!plan) {
    return "No plan was provided.";
  }
  
  if (typeof plan !== "object") {
    return "Invalid plan: must be an object.";
  }
  
  if (plan === null) {
    return "Invalid plan: must be an object.";
  }
  
  if (!("kind" in plan)) {
    return "Invalid plan: must have a kind.";
  }
  
  if (typeof plan.kind !== "string" || !plan.kind) {
    return "Invalid plan: must have a kind.";
  }

  const validKinds = ["keep", "training", "yoga", "breathing", "rest"];
  if (!validKinds.includes(plan.kind)) {
    return "Invalid plan type.";
  }

  return null;
}
