import type { Metadata } from "next";
import { getBrandCssVariables } from "@/lib/branding";
import { generateMetadataFor } from "@/lib/layout-metadata";
import type { BrandResolution } from "@/lib/runtime-brand";

/**
 * Build props for RootLayout from a brand resolution.
 * Extracted seam for testing M10a (metadata) and M10b (CSS vars) mutations.
 */
export async function buildRootLayoutBrandProps(
  getResolution: () => Promise<BrandResolution>
): Promise<{
  brand: BrandResolution["brand"];
  brandCssVars: string;
  metadata: Metadata;
}> {
  const resolution = await getResolution();
  const brand = resolution.brand;
  const brandCssVars = getBrandCssVariables(brand);
  const metadata = await generateMetadataFor(getResolution);

  return { brand, brandCssVars, metadata };
}
