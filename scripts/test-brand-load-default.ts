import { branding } from "../src/lib/branding";

if (branding.id !== "default") {
  throw new Error(`Expected default brand, got: ${branding.id}`);
}

console.log("Default brand loaded:", branding.id);
