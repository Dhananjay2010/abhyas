#!/usr/bin/env tsx
/**
 * Test: Settings page owner section (behavioral)
 * 
 * Unit tests for loadSettingsOwnership and OwnerSection component,
 * plus page-level rendering tests to verify wiring.
 * 
 * Run: npm run test:settings-owner-section
 */

import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "module";
import { JSDOM } from "jsdom";
import { createFakeDb, json } from "./helpers/fake-postgrest";

// Setup JSDOM globals
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { 
  url: "http://localhost/", 
  pretendToBeVisual: true 
});

for (const k of ["window", "document", "HTMLElement", "Node", "navigator", "MouseEvent", "Event", "getComputedStyle"]) {
  Object.defineProperty(globalThis, k, { 
    value: Reflect.get(dom.window, k) ?? dom.window, 
    writable: true, 
    configurable: true 
  });
}

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
Reflect.set(globalThis, "self", dom.window);

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

(async () => {
  const { loadSettingsOwnership, OwnerSection } = await import("../src/app/settings/owner-section");

  console.log("\n=== Unit tests: loadSettingsOwnership ===\n");

  // Test 1: Owner with active gym membership
  {
    console.log("1. Owner with active gym membership");
    const db = createFakeDb();
    let recordedRequest: unknown = null;

    db.beforeRequest = (req) => {
      if (req.table === "gym_memberships") {
        recordedRequest = req;
        return new Response(
          JSON.stringify([
            {
              user_id: "user-owner",
              gym_id: "gym-123",
              joined_at: "2024-01-01T00:00:00Z",
              role: "owner",
              status: "active",
              gyms: { name: "Test Gym", slug: "test-gym" },
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    };

    const ownership = await loadSettingsOwnership(db.client, "user-owner");

    check("isOwner is true", ownership.isOwner === true);
    check("gymId is set", ownership.gymId === "gym-123");
    check("gymName is set", ownership.gymName === "Test Gym");
    check("gymSlug is set", ownership.gymSlug === "test-gym");

    const req = recordedRequest as { filters: Record<string, string> } | null;
    if (req) {
      check("Filters user_id", req.filters.user_id === "eq.user-owner");
      check("Filters role", req.filters.role === "eq.owner");
      check("Filters status", req.filters.status === "eq.active");
    }
    console.log();
  }

  // Test 2: Member (no owner rows)
  {
    console.log("2. Member (no owner rows)");
    const db = createFakeDb();
    db.beforeRequest = (req) => {
      if (req.table === "gym_memberships") {
        db.requests.push(req);
      }
    };
    db.tables.gym_memberships = [];

    const ownership = await loadSettingsOwnership(db.client, "user-member");

    check("isOwner is false", ownership.isOwner === false);
    check("gymId is null", ownership.gymId === null);
    check("gymName is null", ownership.gymName === null);
    check("gymSlug is null", ownership.gymSlug === null);
    console.log();
  }

  // Test 3: 500 error returns NOT_OWNER
  {
    console.log("3. 500 error returns NOT_OWNER");
    const db = createFakeDb();
    db.beforeRequest = (req) => {
      if (req.table === "gym_memberships") {
        return new Response(
          JSON.stringify({ message: "Internal server error" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    };

    const ownership = await loadSettingsOwnership(db.client, "user-error");

    check("isOwner is false", ownership.isOwner === false);
    check("gymId is null", ownership.gymId === null);
    console.log();
  }

  // Test 4: Owner row with missing gymId (edge case)
  {
    console.log("4. Owner row with gymId missing (defensive)");
    const db = createFakeDb();
    db.beforeRequest = (req) => {
      if (req.table === "gym_memberships") {
        return json(200, [{
          user_id: "user-nogym",
          gym_id: null,
          joined_at: "2024-01-01T00:00:00Z",
          role: "owner",
          status: "active",
          gyms: null,
        }]);
      }
    };

    const ownership = await loadSettingsOwnership(db.client, "user-nogym");

    check("isOwner is true", ownership.isOwner === true);
    check("gymId is null", ownership.gymId === null, "gymId missing in row");
    console.log();
  }

  console.log("=== Unit tests: OwnerSection component ===\n");

  // Test 5: Owner renders both links
  {
    console.log("5. Owner renders both links");
    const element = createElement(OwnerSection, {
      ownership: {
        isOwner: true,
        gymId: "gym-123",
        gymName: "Test Gym",
        gymSlug: "test-gym",
      },
    });

    const html = renderToStaticMarkup(element);

    check("HTML contains 'Gym owner'", html.includes("Gym owner"));
    check("HTML contains /owner/branding", html.includes('href="/owner/branding"'));
    check("HTML contains /owner/invites", html.includes('href="/owner/invites"'));
    console.log();
  }

  // Test 6: Member renders empty string
  {
    console.log("6. Member renders empty string");
    const element = createElement(OwnerSection, {
      ownership: {
        isOwner: false,
        gymId: null,
        gymName: null,
        gymSlug: null,
      },
    });

    const html = renderToStaticMarkup(element);

    check("HTML is empty", html === "", `got: "${html}"`);
    console.log();
  }

  // Test 7: 500 error case renders empty string
  {
    console.log("7. Error case (isOwner false) renders empty string");
    const element = createElement(OwnerSection, {
      ownership: {
        isOwner: false,
        gymId: null,
        gymName: null,
        gymSlug: null,
      },
    });

    const html = renderToStaticMarkup(element);

    check("HTML is empty", html === "", `got: "${html}"`);
    console.log();
  }

  // Test 8: Owner with missing gymId renders empty string
  {
    console.log("8. Owner with missing gymId renders empty string");
    const element = createElement(OwnerSection, {
      ownership: {
        isOwner: true,
        gymId: null,
        gymName: null,
        gymSlug: null,
      },
    });

    const html = renderToStaticMarkup(element);

    check("HTML is empty", html === "", `got: "${html}"`);
    console.log();
  }

  console.log("=== Page-level rendering tests ===\n");

  // Module interception setup
  const require = createRequire(import.meta.url);
  const Module = require("module");
  const orig = Module.prototype.require;

  let mockDbClient = createFakeDb().client;

  Module.prototype.require = function (id: string, ...args: unknown[]): unknown {
    if (id === "next/navigation") {
      return {
        useRouter: () => ({ push() {}, refresh() {}, replace() {}, prefetch() {}, back() {}, forward() {} }),
        usePathname: () => "/settings",
        redirect: (u: string) => { throw new Error("REDIRECT " + u); },
        notFound: () => { throw new Error("NOT_FOUND"); },
      };
    }
    if (id === "@/lib/supabase/auth") {
      return {
        getAuthedClient: async () => ({
          supabase: mockDbClient,
          user: { id: "user-test", email: "test@example.com" },
        }),
      };
    }
    if (id === "@/lib/supabase/cached-queries") {
      return {
        getCachedEquipment: async () => [],
      };
    }
    return orig.call(this, id, ...args);
  };

  const { default: SettingsPage } = await import("../src/app/settings/page");

  // Test 9: Owner sees both /owner/* hrefs
  {
    console.log("9. Page with owner sees both /owner/* hrefs");
    const db = createFakeDb();
    db.tables.profiles = [{
      id: "user-test",
      goal: "strength",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 3,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: true,
      onboarding_completed_at: "2024-01-01T00:00:00Z",
      timezone: "UTC",
      date_of_birth: null,
      units: "metric",
    }];
    db.tables.user_settings = [{ user_id: "user-test", planning_mode: "progression" }];
    db.tables.user_equipment = [];
    db.tables.user_injuries = [];

    db.beforeRequest = (req) => {
      if (req.table === "gym_memberships") {
        return json(200, [{
          user_id: "user-test",
          gym_id: "gym-owner",
          role: "owner",
          status: "active",
          gyms: { name: "Owner Gym", slug: "owner-gym" },
        }]);
      }
    };

    mockDbClient = db.client;

    const page = await SettingsPage();
    if (!isValidElement(page)) throw new Error("Page did not return a React element");
    const html = renderToStaticMarkup(page);

    check("HTML contains /owner/branding", html.includes('href="/owner/branding"'));
    check("HTML contains /owner/invites", html.includes('href="/owner/invites"'));
    check("HTML contains 'Gym owner' heading", html.includes("Gym owner"));
    console.log();
  }

  // Test 10: Member (no owner rows) sees no /owner links
  {
    console.log("10. Page with member (no owner rows) sees no /owner links");
    const db = createFakeDb();
    db.tables.profiles = [{
      id: "user-test",
      goal: "strength",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 3,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: true,
      onboarding_completed_at: "2024-01-01T00:00:00Z",
      timezone: "UTC",
      date_of_birth: null,
      units: "metric",
    }];
    db.tables.user_settings = [{ user_id: "user-test", planning_mode: "progression" }];
    db.tables.user_equipment = [];
    db.tables.user_injuries = [];
    db.tables.gym_memberships = [];

    mockDbClient = db.client;

    const page = await SettingsPage();
    if (!isValidElement(page)) throw new Error("Page did not return a React element");
    const html = renderToStaticMarkup(page);

    check("HTML does NOT contain /owner/", !html.includes("/owner/"));
    check("HTML does NOT contain 'Gym owner'", !html.includes("Gym owner"));
    check("HTML still contains 'Legal & Support'", html.includes("Legal &amp; Support"));
    check("HTML still contains 'Delete account'", html.includes("Delete account"));
    console.log();
  }

  // Test 11: 500 error on gym_memberships query shows no owner section
  {
    console.log("11. Page with 500 error on gym_memberships shows no owner section");
    const db = createFakeDb();
    db.tables.profiles = [{
      id: "user-test",
      goal: "strength",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 3,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: true,
      onboarding_completed_at: "2024-01-01T00:00:00Z",
      timezone: "UTC",
      date_of_birth: null,
      units: "metric",
    }];
    db.tables.user_settings = [{ user_id: "user-test", planning_mode: "progression" }];
    db.tables.user_equipment = [];
    db.tables.user_injuries = [];

    db.beforeRequest = (req) => {
      if (req.table === "gym_memberships") {
        return new Response(
          JSON.stringify({ message: "Internal server error" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    };

    mockDbClient = db.client;

    const page = await SettingsPage();
    if (!isValidElement(page)) throw new Error("Page did not return a React element");
    const html = renderToStaticMarkup(page);

    check("HTML does NOT contain /owner/", !html.includes("/owner/"));
    check("HTML does NOT contain 'Gym owner'", !html.includes("Gym owner"));
    check("HTML still contains 'Legal & Support'", html.includes("Legal &amp; Support"));
    check("HTML still contains 'Delete account'", html.includes("Delete account"));
    console.log();
  }

  // Test 12: Thrown exception (rejection) shows no owner section
  {
    console.log("12. Page with thrown exception shows no owner section (tests try/catch)");
    const db = createFakeDb();
    db.tables.profiles = [{
      id: "user-test",
      goal: "strength",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 3,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: true,
      onboarding_completed_at: "2024-01-01T00:00:00Z",
      timezone: "UTC",
      date_of_birth: null,
      units: "metric",
    }];
    db.tables.user_settings = [{ user_id: "user-test", planning_mode: "progression" }];
    db.tables.user_equipment = [];
    db.tables.user_injuries = [];

    db.beforeRequest = (req) => {
      if (req.table === "gym_memberships") {
        throw new Error("Network failure");
      }
    };

    mockDbClient = db.client;

    const page = await SettingsPage();
    if (!isValidElement(page)) throw new Error("Page did not return a React element");
    const html = renderToStaticMarkup(page);

    check("HTML does NOT contain /owner/", !html.includes("/owner/"));
    check("HTML does NOT contain 'Gym owner'", !html.includes("Gym owner"));
    check("HTML still contains 'Legal & Support'", html.includes("Legal &amp; Support"));
    check("HTML still contains 'Delete account'", html.includes("Delete account"));
    console.log();
  }

  // Restore original require
  Module.prototype.require = orig;

  console.log(`\n${failures === 0 ? "✅" : "❌"} ${failures === 0 ? "All" : `${failures}`} tests ${failures === 0 ? "passed" : "failed"}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
