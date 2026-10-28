/**
 * Testable metadata generation logic extracted from layout.tsx
 * This module can be imported by tsx without CSS imports.
 */

import type { Metadata } from "next";
import { buildMetadata } from "./metadata-builder";
import type { BrandResolution } from "./runtime-brand";

/**
 * Generate metadata from a brand resolution.
 * Injectable for testing - pass a stub resolution function.
 */
export async function generateMetadataFor(
  resolve: () => Promise<BrandResolution>
): Promise<Metadata> {
  const resolution = await resolve();
  return buildMetadata(resolution.brand);
}
