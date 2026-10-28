/**
 * Production dependencies for page.tsx entry point.
 * Exported for testing. Default binding is the real production function.
 */

import { renderLandingPageForRequest } from "./render-landing-page";

export const pageDeps = {
  renderLandingPageForRequest,
};
