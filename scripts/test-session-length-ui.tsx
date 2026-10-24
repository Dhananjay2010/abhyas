/**
 * Test M2 & L2: Session length onboarding default and Settings rollback.
 *
 * M2: Onboarding session-length step should preselect 45 minutes (not 60).
 * L2: Settings should revert to last saved value on validation error.
 *
 * Real RTL tests with jsdom, not source greps.
 *
 *   npm run test:session-length-ui
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

// Mock Next.js router BEFORE importing any Next.js modules
const mockRouter = {
  push: () => {},
  replace: () => {},
  refresh: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
  pathname: "/onboarding",
  query: {},
  asPath: "/onboarding",
};

// Set up module mock registry
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string): unknown {
  if (id === "next/navigation") {
    return {
      useRouter: () => mockRouter,
      usePathname: () => "/onboarding",
      useSearchParams: () => new URLSearchParams(),
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
  const { render, cleanup, waitFor } = await import("@testing-library/react");
  const userEvent = (await import("@testing-library/user-event")).default;
  
  const onboardingModule = await import("../src/app/onboarding/onboarding-flow");
  const settingsModule = await import("../src/app/settings/settings-form");

  console.log("\n1. M2: Onboarding preselects 45 when stored value is null");
  {
    const initialState = {
      displayName: "Test User",
      dateOfBirth: "1990-01-01",
      sex: "male" as const,
      heightCm: 175,
      weightKg: 70,
      goal: "muscle_gain" as const,
      level: "intermediate" as const,
      primaryTrack: "weights" as const,
      daysPerWeek: 4,
      sessionMinutes: null, // NULL from DB after migration
      yogaDaysPerWeek: 0,
      disclaimerAccepted: true,
      hasAllEquipment: false,
      equipmentIds: [],
      injuries: [],
    };

    const stubActions = {
      acceptDisclaimer: async () => ({ ok: true as const }),
      saveAboutYou: async () => ({ ok: true as const }),
      saveProfileFields: async () => ({ ok: true as const }),
      saveEquipment: async () => ({ ok: true as const }),
      saveInjuries: async () => ({ ok: true as const }),
      saveSessionLength: async () => ({ ok: true as const }),
      completeOnboarding: async () => ({ ok: true as const }),
    };

    render(
      <onboardingModule.OnboardingFlow
        initial={initialState}
        equipment={[]}
        actions={stubActions}
      />
    );

    // Find the 45m button (should be selected/pressed)
    const button45 = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "45m"
    );
    check("45m button exists", !!button45);
    
    if (button45) {
      const isPressed = button45.getAttribute("aria-checked") === "true";
      check(
        "45m is preselected (aria-checked=true) when sessionMinutes is null",
        isPressed,
        `got aria-checked=${button45.getAttribute("aria-checked")}`
      );
    }

    cleanup();
  }

  console.log("\n2. L2: Settings reverts to saved value on validation error");
  {
    const initialSettings = {
      displayName: "Test User",
      dateOfBirth: "1990-01-01",
      sex: "male" as const,
      heightCm: 175,
      weightKg: 70,
      goal: "muscle_gain" as const,
      level: "intermediate" as const,
      primaryTrack: "weights" as const,
      daysPerWeek: 4,
      yogaDaysPerWeek: 0,
      preferredSessionMinutes: 45, // Saved value
      hasAllEquipment: false,
      equipmentIds: [],
      injuries: [],
      planningMode: "progression" as const,
      perSetLogging: true,
      resumeSession: true,
      cooldownEnabled: true,
      restAutostart: true,
      restSound: true,
      restVibrate: true,
      restOverrideSeconds: null,
      bodyweightPrompt: "weekly" as const,
      timezone: null,
    };

    let updateCalls = 0;

    const stubActions = {
      updateSessionSettings: async () => ({ ok: true as const }),
      updateProfileSettings: async (patch: { preferred_session_minutes?: number }) => {
        updateCalls++;
        // First call (trying to change to 60) fails
        if (updateCalls === 1 && patch.preferred_session_minutes === 60) {
          return { ok: false as const, error: "Validation error: invalid session length" };
        }
        return { ok: true as const };
      },
      updateEquipment: async () => ({ ok: true as const }),
      updateInjuries: async () => ({ ok: true as const }),
    };

    const equipment = [] as { id: string; name: string; category: string }[];
    const timezones: string[] = ["America/New_York"];

    render(
      <settingsModule.SettingsForm
        initial={initialSettings}
        equipment={equipment}
        timezones={timezones}
        actions={stubActions}
      />
    );

    const user = userEvent.setup({ document });

    // Find session length buttons
    const buttons = [...document.querySelectorAll("button")].filter(
      (b) => b.textContent?.match(/^\d+m$/)
    );
    const button45 = buttons.find((b) => b.textContent === "45m");
    const button60 = buttons.find((b) => b.textContent === "60m");

    check("Found 45m button", !!button45);
    check("Found 60m button", !!button60);

    if (button45 && button60) {
      // Initial state: 45 should be pressed
      check(
        "Initially 45m is pressed",
        button45.getAttribute("aria-pressed") === "true",
        `got aria-pressed=${button45.getAttribute("aria-pressed")}`
      );

      // Click 60m (this will fail validation)
      await user.click(button60);

      // Wait for state update
      await waitFor(() => {
        const errorElement = document.querySelector('[role="alert"]') ||
                            [...document.querySelectorAll("*")].find(e => 
                              e.textContent?.includes("Validation error")
                            );
        return errorElement !== null;
      }, { timeout: 2000 });

      // After failed save, 45m should be pressed again (reverted)
      const is45Pressed = button45.getAttribute("aria-pressed") === "true";
      const is60Pressed = button60.getAttribute("aria-pressed") === "true";
      
      check(
        "After validation error, 45m is pressed again (reverted)",
        is45Pressed && !is60Pressed,
        `45m aria-pressed=${button45.getAttribute("aria-pressed")}, 60m aria-pressed=${button60.getAttribute("aria-pressed")}`
      );

      // Error message should be displayed
      const errorShown = [...document.querySelectorAll("*")].some((e) =>
        e.textContent?.includes("Validation error")
      );
      check("Error message is displayed", errorShown);
    }

    cleanup();
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();

export {};
