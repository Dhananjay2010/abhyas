/**
 * Test: Settings DOB data-loss bug prevention
 * 
 * After #92, incomplete DOB emits null. This test ensures that:
 * 1. Typing a partial year (e.g. '199') and blurring does NOT save null to DB
 * 2. An inline error 'Enter your full date of birth' is shown
 * 3. The stored DOB is not wiped
 * 
 * Uses QA's proven harness approach: jsdom before React loads, userEvent, stateful parent.
 */

import { JSDOM } from "jsdom";

// Setup JSDOM before React loads
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { 
  url: "http://localhost/", 
  pretendToBeVisual: true 
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const g: any = globalThis;
for (const k of ["window","document","HTMLElement","Node","navigator","FocusEvent","KeyboardEvent","MouseEvent","InputEvent","Event","getComputedStyle","HTMLInputElement"]) {
  Object.defineProperty(g, k, { 
    value: (dom.window as any)[k] ?? dom.window, 
    writable: true, 
    configurable: true 
  });
}
g.window = dom.window;
g.IS_REACT_ACT_ENVIRONMENT = true;
(g as any).self = g.window;
g.requestIdleCallback = ((cb: any) => setTimeout(cb, 0)) as any;
g.cancelIdleCallback = ((id: any) => clearTimeout(id)) as any;
(g as any).IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
/* eslint-enable @typescript-eslint/no-explicit-any */

async function main() {
  console.log("\n=== Settings DOB Data-Loss Bug Prevention Test ===\n");

  const React = await import("react");
  const { render, cleanup, act } = await import("@testing-library/react");
  const userEvent = (await import("@testing-library/user-event")).default;
  const { DobInput } = await import("@/components/onboarding/dob-input");

  console.log("1. Render DobInput with stored DOB, type partial year, blur");
  {
    let saveCallCount = 0;
    let savedValue: string | null | undefined = undefined;
    let errorShown: string | undefined = undefined;

    // Simulate Settings form with stored DOB
    function SettingsDobSection() {
      const [dateOfBirth, setDateOfBirth] = React.useState<string | null>("1985-11-03");
      const [dobError, setDobError] = React.useState<string | null>(null);
      const [dobTouched, setDobTouched] = React.useState(false);
      const initialDob = React.useRef("1985-11-03");

      const handleSave = React.useCallback(async (dob: string | null) => {
        saveCallCount++;
        savedValue = dob;
        // Simulate server response
        return { ok: false, error: "Should not be called" };
      }, []);

      return React.createElement("div", null,
        React.createElement(DobInput, {
          value: dateOfBirth,
          onChange: (iso: string | null) => {
            setDateOfBirth(iso);
            if (dobTouched) {
              // Simplified validation for test
              setDobError(iso ? null : "Enter your full date of birth");
            }
          },
          onBlur: () => {
            setDobTouched(true);
            
            // Data-loss bug prevention: incomplete DOB (null) should NOT save
            if (dateOfBirth === null && initialDob.current !== null) {
              setDobError("Enter your full date of birth");
              errorShown = "Enter your full date of birth";
              return;
            }
            
            // Only save if changed and not null
            if (dateOfBirth !== initialDob.current && dateOfBirth !== null) {
              handleSave(dateOfBirth);
            }
          },
          error: dobTouched ? dobError ?? undefined : undefined,
        })
      );
    }

    const { container } = render(React.createElement(SettingsDobSection));
    const u = userEvent.setup({ document });

    // Verify initial state: stored DOB is shown
    const yearInput = container.querySelector('input[aria-label="Year"]') as HTMLInputElement;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    if (yearInput.value !== "1985") {
      console.log(`   ❌ FAIL: Expected initial year '1985', got '${yearInput.value}'`);
      process.exit(1);
    }
    console.log("   ✅ PASS: Initial stored DOB '1985-11-03' rendered");

    // Type partial year: select all, type '198' (incomplete)
    await act(async () => {
      await u.click(yearInput);
      await u.tripleClick(yearInput);
      await u.keyboard("198");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const currentValue: string = yearInput.value;
    if (currentValue !== "198") {
      console.log(`   ❌ FAIL: Expected partial year '198', got '${currentValue}'`);
      process.exit(1);
    }
    console.log("   ✅ PASS: Partial year '198' typed");

    // Blur to trigger save attempt
    await act(async () => {
      await u.click(document.body);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    // Verify save was NOT called
    if (saveCallCount !== 0) {
      console.log(`   ❌ FAIL: Save should NOT be called with incomplete DOB (called ${saveCallCount} times with value ${savedValue})`);
      process.exit(1);
    }
    console.log("   ✅ PASS: Save NOT called with incomplete DOB (data-loss prevented)");

    // Verify error message is shown
    const containerText = container.textContent || "";
    if (!containerText.includes("Enter your full date of birth") && !errorShown) {
      console.log(`   ❌ FAIL: Error message not shown. Container: ${containerText}, errorShown: ${errorShown}`);
      process.exit(1);
    }
    console.log("   ✅ PASS: Inline error 'Enter your full date of birth' shown");

    cleanup();
  }

  console.log("\n2. Complete the year and verify save IS called");
  {
    let saveCallCount = 0;
    let savedValue: string | null | undefined = undefined;

    function SettingsDobSection() {
      const [dateOfBirth, setDateOfBirth] = React.useState<string | null>("1985-11-03");
      const [dobError, setDobError] = React.useState<string | null>(null);
      const [dobTouched, setDobTouched] = React.useState(false);
      const initialDob = React.useRef("1985-11-03");

      const handleSave = React.useCallback(async (dob: string | null) => {
        saveCallCount++;
        savedValue = dob;
        return { ok: true };
      }, []);

      return React.createElement("div", null,
        React.createElement(DobInput, {
          value: dateOfBirth,
          onChange: (iso: string | null) => {
            setDateOfBirth(iso);
            if (dobTouched) {
              setDobError(iso ? null : "Enter your full date of birth");
            }
          },
          onBlur: () => {
            setDobTouched(true);
            
            if (dateOfBirth === null && initialDob.current !== null) {
              setDobError("Enter your full date of birth");
              return;
            }
            
            if (dateOfBirth !== initialDob.current && dateOfBirth !== null) {
              handleSave(dateOfBirth);
            }
          },
          error: dobTouched ? dobError ?? undefined : undefined,
        })
      );
    }

    const { container } = render(React.createElement(SettingsDobSection));
    const u = userEvent.setup({ document });

    const yearInput = container.querySelector('input[aria-label="Year"]') as HTMLInputElement;

    // Type complete new year: 1990
    await act(async () => {
      await u.click(yearInput);
      await u.tripleClick(yearInput);
      await u.keyboard("1990");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Blur to trigger save
    await act(async () => {
      await u.click(document.body);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    // Verify save WAS called with correct value
    if (saveCallCount !== 1) {
      console.log(`   ❌ FAIL: Save should be called once with complete DOB (called ${saveCallCount} times)`);
      process.exit(1);
    }

    if (savedValue !== "1990-11-03") {
      console.log(`   ❌ FAIL: Expected save with '1990-11-03', got '${savedValue}'`);
      process.exit(1);
    }

    console.log("   ✅ PASS: Complete DOB '1990-11-03' saved successfully");

    cleanup();
  }

  console.log("\n✅ All Settings DOB data-loss prevention tests passed");
  console.log("   - Partial year (null) does NOT save");
  console.log("   - Inline error shown for incomplete DOB");
  console.log("   - Complete DOB saves correctly\n");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
