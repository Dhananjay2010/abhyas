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
  
  const planObj = plan as Record<string, unknown>;
  
  if (!("kind" in planObj) || !planObj.kind) {
    return "Invalid plan: must have a kind.";
  }

  const validKinds = ["keep", "training", "yoga", "breathing", "rest"];
  if (!validKinds.includes(String(planObj.kind))) {
    return "Invalid plan type.";
  }

  return null;
}
