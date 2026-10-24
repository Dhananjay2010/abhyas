/**
 * Controlled DobInput tests - reproduce the round-trip bug from PR #72 QA report.
 * 
 * Based on QA harness that properly reproduces the bug using @testing-library/user-event.
 * Uses key-by-key typing with a stateful parent that feeds value back to DobInput.
 */

// Setup jsdom BEFORE any React imports
import "./helpers/setup-jsdom";

// Then import React libraries
import { render, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, useCallback } from "react";
import { DobInput } from "../src/components/onboarding/dob-input";

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`PASS ${message}`);
  } else {
    failed++;
    console.error(`FAIL ${message}`);
  }
}

// Controlled parent that mimics onboarding-flow.tsx
let parentVal: string | null;
let emitted: (string | null)[] = [];
let blurs = 0;

function Parent({ 
  init = null as string | null, 
  inlineOnChange = false 
}: { 
  init?: string | null; 
  inlineOnChange?: boolean;
}) {
  const [v, setV] = useState<string | null>(init);
  parentVal = v;
  
  // Test with both inline and memoized onChange (both should work)
  const onChange = inlineOnChange 
    ? (x: string | null) => { emitted.push(x); setV(x); }
    : useCallback((x: string | null) => { emitted.push(x); setV(x); }, []);
  
  return (
    <div>
      <DobInput value={v} onChange={onChange} onBlur={() => blurs++} />
      <button>Sex</button>
      <button onClick={() => setV("1985-11-03")}>Ext</button>
      <button onClick={() => setV(null)}>Reset</button>
    </div>
  );
}

const q = (name: string) => 
  document.querySelector(`input[aria-label="${name}"]`) as HTMLInputElement;

const screenBtn = (text: string) => 
  [...document.querySelectorAll("button")].find(b => b.textContent === text)!;

async function scenario(
  name: string, 
  init: string | null, 
  inline: boolean, 
  fn: (u: ReturnType<typeof userEvent.setup>) => Promise<void>
) {
  emitted = [];
  blurs = 0;
  const u = userEvent.setup({ document });
  render(<Parent init={init} inlineOnChange={inline} />);
  
  try {
    await fn(u);
  } catch (e) {
    check(false, `${name}: threw ${e}`);
  }
  
  cleanup();
}

console.log("\n🧪 Testing DobInput controlled round-trip (PR #72 C1, M1, L1)\n");

async function runTests() {
  // Test with both inline and memoized onChange
  for (const inline of [false, true]) {
    const tag = inline ? "[inline onChange]" : "[memo onChange]";
    
    // Scenario 1: Type from empty
    await scenario("type", null, inline, async (u) => {
      await u.click(q("Day"));
      await u.keyboard("12051992");
      
      check(
        q("Day").value === "12" && q("Month").value === "05",
        `${tag} C1 day/month '12'/'05' after key-by-key (got ${q("Day").value}/${q("Month").value})`
      );
      
      check(
        q("Year").value === "1992",
        `${tag} C1 year typed key-by-key shows 1992 (got '${q("Year").value}')`
      );
      
      check(
        parentVal === "1992-05-12",
        `${tag} C1 parent value 1992-05-12 (got ${parentVal})`
      );
      
      check(
        !emitted.some(e => e && e.startsWith("000")),
        `${tag} C1 no 000x emissions (emitted ${JSON.stringify(emitted)})`
      );
      
      check(
        blurs === 0,
        `${tag} L1 no onBlur while moving within fieldset (blurs=${blurs})`
      );
      
      await u.click(document.querySelector("button")!);
      check(
        blurs === 1,
        `${tag} L1 onBlur once when leaving fieldset (blurs=${blurs})`
      );
      
      // Backspace to partial year
      await u.click(q("Year"));
      await u.keyboard("{Backspace}");
      check(
        q("Year").value === "199" && parentVal === null,
        `${tag} M1 backspace to 199 shows 199 and parent null (got '${q("Year").value}', ${parentVal})`
      );
      
      // Clear year completely
      await u.keyboard("{Backspace}{Backspace}{Backspace}");
      check(
        q("Year").value === "" && parentVal === null,
        `${tag} M1 cleared year -> parent null (got '${q("Year").value}', ${parentVal})`
      );
      
      // Backspace in empty year moves to month
      await u.keyboard("{Backspace}");
      check(
        document.activeElement === q("Month"),
        `${tag} backspace in empty year moves to month`
      );
      
      // Retype year
      await u.click(q("Year"));
      await u.keyboard("2001");
      check(
        parentVal === "2001-05-12",
        `${tag} retype year -> 2001-05-12 (got ${parentVal})`
      );
      
      // External set
      await u.click(screenBtn("Ext"));
      check(
        q("Day").value === "03" && q("Month").value === "11" && q("Year").value === "1985" && parentVal === "1985-11-03",
        `${tag} external set 1985-11-03 reflected (got ${q("Day").value}/${q("Month").value}/${q("Year").value}, parent ${parentVal})`
      );
      
      // External reset
      await u.click(screenBtn("Reset"));
      check(
        q("Day").value === "" && q("Year").value === "" && parentVal === null,
        `${tag} external reset clears fields (got '${q("Day").value}'/'${q("Year").value}', parent ${parentVal})`
      );
    });
    
    // Scenario 2: Edit prefilled value
    await scenario("prefilled-edit", "1992-05-12", inline, async (u) => {
      check(
        q("Year").value === "1992",
        `${tag} prefilled shows 1992`
      );
      
      await u.tripleClick(q("Year"));
      await u.keyboard("1990");
      check(
        q("Year").value === "1990" && parentVal === "1990-05-12",
        `${tag} select-all year and type 1990 (got '${q("Year").value}', parent ${parentVal})`
      );
      
      await u.tripleClick(q("Day"));
      await u.keyboard("3");
      check(
        q("Day").value === "3" && parentVal === "1990-05-03",
        `${tag} single-digit day 3 -> 1990-05-03 (got '${q("Day").value}', ${parentVal})`
      );
    });
    
    // Scenario 3: Transient partial states
    await scenario("transient", null, inline, async (u) => {
      await u.click(q("Day"));
      await u.keyboard("1");
      await u.click(q("Month"));
      await u.keyboard("0");
      await u.click(q("Year"));
      await u.keyboard("1990");
      
      check(
        true,
        `${tag} INFO day '1' month '0' year 1990 -> parent ${parentVal} (emitted ${JSON.stringify(emitted)})`
      );
    });
  }
}

runTests().then(() => {
  console.log(`\n✅ ${passed} passed, ❌ ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
});
