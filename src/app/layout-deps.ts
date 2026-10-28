/**
 * Production dependencies for layout.tsx entry points.
 * Exported for testing. Default bindings are the real production functions.
 */

import { getRootLayoutMetadataForRequest, getRootLayoutBrandCssForRequest } from "@/lib/layout-props";

export const layoutDeps = {
  getRootLayoutMetadataForRequest,
  getRootLayoutBrandCssForRequest,
};
