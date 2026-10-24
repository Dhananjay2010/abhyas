import { branding } from "../src/lib/branding";

if (branding.id !== "example") {
  throw new Error(`Expected example brand, got: ${branding.id}`);
}

console.log("Example brand loaded:", branding.id);
