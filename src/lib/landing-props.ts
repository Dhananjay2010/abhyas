import type { Brand } from "@/lib/branding";
import type { BrandResolution } from "@/lib/runtime-brand";

/**
 * Build props for Landing page from a brand resolution.
 * Extracted seam for testing M10c (brand prop) mutation.
 */
export async function buildLandingBrandProp(
  getResolution: () => Promise<BrandResolution>
): Promise<{ brand: Brand }> {
  const resolution = await getResolution();
  return { brand: resolution.brand };
}
