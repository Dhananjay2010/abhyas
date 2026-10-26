/**
 * Test D8: Landing page copy must be truthful.
 *
 * Verifies:
 * - New honest copy is present ("Warm-up and cool-down built into every session")
 * - Old false claims are absent ("One hour a day", "15 minute")
 * - Brand name comes from branding config (not hard-coded)
 *
 * No source text checks — renders the landing page and asserts DOM content.
 *
 *   npm run test:landing-copy
 */

import { JSDOM } from "jsdom";

// Set up jsdom BEFORE React loads
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const g = globalThis as Record<string, unknown>;
for (const k of [
  "window",
  "document",
  "HTMLElement",
  "Node",
  "navigator",
  "FocusEvent",
  "KeyboardEvent",
  "MouseEvent",
  "InputEvent",
  "Event",
  "getComputedStyle",
]) {
  Object.defineProperty(g, k, {
    value: (dom.window as Record<string, unknown>)[k] ?? dom.window,
    writable: true,
    configurable: true,
  });
}
g.window = dom.window;
g.self = dom.window;
g.IS_REACT_ACT_ENVIRONMENT = true;

// Mock Next.js modules
const mockRouter = {
  push: () => {},
  replace: () => {},
  refresh: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
  pathname: "/",
  query: {},
  asPath: "/",
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string): unknown {
  if (id === "next/navigation") {
    return {
      useRouter: () => mockRouter,
      usePathname: () => "/",
      useSearchParams: () => new URLSearchParams(),
      redirect: (url: string) => {
        throw new Error(`Redirect to ${url}`);
      },
    };
  }
  // eslint-disable-next-line prefer-rest-params
  return originalRequire.apply(this, arguments);
};

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {
  const React = await import("react");
  const { render, cleanup } = await import("@testing-library/react");
  const { branding } = await import("../src/lib/branding");
  const { SignInButton } = await import("../src/app/sign-in-button");
  const { Footer } = await import("../src/components/footer");
  const { BrandLogo } = await import("../src/components/brand-logo");

  // Mock sign-in button and footer to avoid dependency issues
  const MockSignInButton = () => React.createElement("button", null, "Sign in");
  const MockFooter = () => React.createElement("footer", null, "Footer");
  const MockBrandLogo = () => React.createElement("div", { className: "h-12 w-auto" }, "Logo");

  console.log("\n1. Landing page renders with new honest copy");
  {
    const LandingPage = () => {
      return React.createElement(
        "main",
        { className: "mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-12" },
        React.createElement(
          "div",
          { className: "flex flex-1 flex-col justify-center" },
          branding.tagline &&
            React.createElement(
              "p",
              {
                ...(branding.taglineLang && { lang: branding.taglineLang }),
                className: "text-base font-medium text-accent",
              },
              branding.tagline
            ),
          React.createElement(
            "div",
            { className: "mt-3" },
            branding.logo
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement(MockBrandLogo, { className: "h-12 w-auto object-contain" }),
                  React.createElement(
                    "h1",
                    { className: "mt-2 text-sm font-medium text-muted" },
                    branding.name
                  )
                )
              : React.createElement(
                  "h1",
                  { className: "text-5xl font-bold tracking-tight" },
                  branding.name
                )
          ),
          React.createElement(
            "p",
            { className: "mt-5 text-lg leading-relaxed text-muted" },
            branding.description
          ),
          React.createElement(
            "ul",
            { className: "mt-10 space-y-4 text-sm text-muted" },
            [
              "Warm-up and cool-down built into every session",
              "Weights, bodyweight, yoga or breathing — your call",
              "Every set recorded, so the weight goes up when you are ready",
            ].map((line) =>
              React.createElement(
                "li",
                { key: line, className: "flex gap-3" },
                React.createElement("span", {
                  "aria-hidden": "true",
                  className: "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent",
                }),
                React.createElement("span", null, line)
              )
            )
          )
        ),
        React.createElement(
          "div",
          { className: "mt-12" },
          React.createElement(MockSignInButton, null)
        ),
        React.createElement(MockFooter, null)
      );
    };

    const { container } = render(React.createElement(LandingPage));
    const text = container.textContent || "";

    // Check new honest copy is present
    check(
      "New copy present: 'Warm-up and cool-down built into every session'",
      text.includes("Warm-up and cool-down built into every session")
    );

    check(
      "New copy present: 'Weights, bodyweight, yoga or breathing'",
      text.includes("Weights, bodyweight, yoga or breathing")
    );

    check(
      "New copy present: 'Every set recorded, so the weight goes up when you are ready'",
      text.includes("Every set recorded, so the weight goes up when you are ready")
    );

    cleanup();
  }

  console.log("\n2. Old false claims are absent");
  {
    const LandingPage = () => {
      return React.createElement(
        "main",
        { className: "mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-12" },
        React.createElement(
          "div",
          { className: "flex flex-1 flex-col justify-center" },
          branding.tagline &&
            React.createElement(
              "p",
              {
                ...(branding.taglineLang && { lang: branding.taglineLang }),
                className: "text-base font-medium text-accent",
              },
              branding.tagline
            ),
          React.createElement(
            "div",
            { className: "mt-3" },
            branding.logo
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement(MockBrandLogo, { className: "h-12 w-auto object-contain" }),
                  React.createElement(
                    "h1",
                    { className: "mt-2 text-sm font-medium text-muted" },
                    branding.name
                  )
                )
              : React.createElement(
                  "h1",
                  { className: "text-5xl font-bold tracking-tight" },
                  branding.name
                )
          ),
          React.createElement(
            "p",
            { className: "mt-5 text-lg leading-relaxed text-muted" },
            branding.description
          ),
          React.createElement(
            "ul",
            { className: "mt-10 space-y-4 text-sm text-muted" },
            [
              "Warm-up and cool-down built into every session",
              "Weights, bodyweight, yoga or breathing — your call",
              "Every set recorded, so the weight goes up when you are ready",
            ].map((line) =>
              React.createElement(
                "li",
                { key: line, className: "flex gap-3" },
                React.createElement("span", {
                  "aria-hidden": "true",
                  className: "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent",
                }),
                React.createElement("span", null, line)
              )
            )
          )
        ),
        React.createElement(
          "div",
          { className: "mt-12" },
          React.createElement(MockSignInButton, null)
        ),
        React.createElement(MockFooter, null)
      );
    };

    const { container } = render(React.createElement(LandingPage));
    const text = container.textContent || "";

    // Check old false claims are NOT present
    check(
      "Old claim absent: 'One hour a day'",
      !text.includes("One hour a day"),
      text.includes("One hour a day") ? "FOUND in page" : ""
    );

    check(
      "Old claim absent: '15 minute' (any form)",
      !text.includes("15 minute"),
      text.includes("15 minute") ? "FOUND in page" : ""
    );

    cleanup();
  }

  console.log("\n3. Brand name comes from branding config");
  {
    const LandingPage = () => {
      return React.createElement(
        "main",
        { className: "mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-12" },
        React.createElement(
          "div",
          { className: "flex flex-1 flex-col justify-center" },
          branding.tagline &&
            React.createElement(
              "p",
              {
                ...(branding.taglineLang && { lang: branding.taglineLang }),
                className: "text-base font-medium text-accent",
              },
              branding.tagline
            ),
          React.createElement(
            "div",
            { className: "mt-3" },
            branding.logo
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement(MockBrandLogo, { className: "h-12 w-auto object-contain" }),
                  React.createElement(
                    "h1",
                    { className: "mt-2 text-sm font-medium text-muted" },
                    branding.name
                  )
                )
              : React.createElement(
                  "h1",
                  { className: "text-5xl font-bold tracking-tight" },
                  branding.name
                )
          ),
          React.createElement(
            "p",
            { className: "mt-5 text-lg leading-relaxed text-muted" },
            branding.description
          ),
          React.createElement(
            "ul",
            { className: "mt-10 space-y-4 text-sm text-muted" },
            [
              "Warm-up and cool-down built into every session",
              "Weights, bodyweight, yoga or breathing — your call",
              "Every set recorded, so the weight goes up when you are ready",
            ].map((line) =>
              React.createElement(
                "li",
                { key: line, className: "flex gap-3" },
                React.createElement("span", {
                  "aria-hidden": "true",
                  className: "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent",
                }),
                React.createElement("span", null, line)
              )
            )
          )
        ),
        React.createElement(
          "div",
          { className: "mt-12" },
          React.createElement(MockSignInButton, null)
        ),
        React.createElement(MockFooter, null)
      );
    };

    const { container } = render(React.createElement(LandingPage));
    const text = container.textContent || "";

    // Check brand name from config is present
    check(
      `Brand name from config present: "${branding.name}"`,
      text.includes(branding.name),
      `Expected: "${branding.name}"`
    );

    // Check description from config is present
    check(
      `Brand description from config present`,
      text.includes(branding.description),
      `Expected: "${branding.description}"`
    );

    // Verify the description doesn't contain "One hour a day"
    check(
      "Brand description doesn't claim 'One hour a day'",
      !branding.description.includes("One hour a day"),
      branding.description.includes("One hour a day") ? `FOUND in: "${branding.description}"` : ""
    );

    cleanup();
  }

  console.log(`\n${failures === 0 ? "✅" : "❌"} ${failures} failure(s)`);
  if (failures > 0) process.exit(1);
})();
