/**
 * Test swap sheet state logic (empty copy, skip button)
 *
 *   npm run test:swap-sheet-state
 */
import { swapSheetState } from "../src/lib/session/swap";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nSwap sheet: empty alternatives");
{
  const state = swapSheetState({ alternatives: [] });
  
  check("isEmpty is true",
    state.isEmpty === true,
    `got ${state.isEmpty}`);
  
  check("shows exact copy",
    state.message === "No safe swap for this one. You can skip it.",
    `got: "${state.message}"`);
  
  check("showSkipButton is true",
    state.showSkipButton === true,
    `got ${state.showSkipButton}`);
}

console.log("\nSwap sheet: has alternatives");
{
  const state = swapSheetState({ alternatives: [{ id: 1 }, { id: 2 }] });
  
  check("isEmpty is false",
    state.isEmpty === false,
    `got ${state.isEmpty}`);
  
  check("no message",
    state.message === "",
    `got: "${state.message}"`);
  
  check("showSkipButton is false",
    state.showSkipButton === false,
    `got ${state.showSkipButton}`);
}

console.log("\nSwap sheet: single alternative");
{
  const state = swapSheetState({ alternatives: [{ id: 1 }] });
  
  check("isEmpty is false",
    state.isEmpty === false,
    `got ${state.isEmpty}`);
  
  check("no message",
    state.message === "",
    `got: "${state.message}"`);
  
  check("showSkipButton is false",
    state.showSkipButton === false,
    `got ${state.showSkipButton}`);
}

console.log("\nMutation guards: empty swap list behavior");
{
  // O4: Empty copy doesn't show
  const empty = swapSheetState({ alternatives: [] });
  check("O4: empty copy shows (mutation guard)",
    empty.message.includes("No safe swap"),
    `got: "${empty.message}"`);
  
  // O5: Skip button doesn't render
  check("O5: Skip button renders when empty (mutation guard)",
    empty.showSkipButton === true,
    `got ${empty.showSkipButton}`);
  
  // O6: Skip button renders when not empty
  const notEmpty = swapSheetState({ alternatives: [{ id: 1 }] });
  check("O6: Skip button doesn't render when alternatives exist (mutation guard)",
    notEmpty.showSkipButton === false,
    `got ${notEmpty.showSkipButton}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
