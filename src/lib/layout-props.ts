import type { Metadata } from "next";
import { getBrandCssVariables } from "@/lib/branding";
import { generateMetadataFor } from "@/lib/layout-metadata";
import { getRequestBrandResolution } from "@/lib/runtime-brand";
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

/**
 * Production entry point for metadata with real dependency bound.
 * Call sites: layout.tsx generateMetadata
 */
export async function getRootLayoutMetadataForRequest(): Promise<Metadata> {
  const { metadata } = await buildRootLayoutBrandProps(getRequestBrandResolution);
  return metadata;
}

/**
 * Production entry point for CSS variables with real dependency bound.
 * Call sites: layout.tsx default export
 */
export async function getRootLayoutBrandCssForRequest(): Promise<string> {
  const { brandCssVars } = await buildRootLayoutBrandProps(getRequestBrandResolution);
  return brandCssVars;
}
