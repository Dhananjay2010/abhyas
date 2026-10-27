import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

console.log("=== TEST: Gym join code wiring integrity ===\n");

// W1: actions.ts must use gymName in processRedeemResult call
console.log("TEST: W1 - actions.ts passes gymName to processRedeemResult");
const actionsSource = readFileSync(join(__dirname, "..", "src", "app", "join", "[code]", "actions.ts"), "utf-8");
assert.match(
  actionsSource,
  /processRedeemResult\([^,]+,\s*gymName\)/,
  "FAIL: actions.ts must pass gymName to processRedeemResult"
);
console.log("  ✓ actions.ts passes gymName to processRedeemResult\n");

// W2: actions.ts must look up gymName server-side (not accept it as parameter)
console.log("TEST: W2 - actions.ts looks up gymName server-side");
assert.match(
  actionsSource,
  /export async function redeemJoinCode\(code: string\)/,
  "FAIL: redeemJoinCode must NOT accept gymName as parameter"
);
assert.match(
  actionsSource,
  /from\("gym_join_codes"\)[\s\S]*\.select\([^)]*gyms\(name\)/,
  "FAIL: actions.ts must query gym name from gym_join_codes"
);
console.log("  ✓ actions.ts looks up gymName server-side\n");

// W3: gating must use the code's role in comparison
console.log("TEST: W3 - gating uses code role");
const gatingSource = readFileSync(join(__dirname, "..", "src", "lib", "gym-join-code-gating.ts"), "utf-8");
assert.match(
  gatingSource,
  /roleOrder\[codeRole\]/,
  "FAIL: gating must use codeRole in roleOrder comparison"
);
console.log("  ✓ gating uses code role in comparison\n");

// W4: join page must call mapPreviewResultToMessage
console.log("TEST: W4 - join page uses mapPreviewResultToMessage");
const pageSource = readFileSync(join(__dirname, "..", "src", "app", "join", "[code]", "page.tsx"), "utf-8");
assert.match(
  pageSource,
  /import.*mapPreviewResultToMessage.*from/,
  "FAIL: page must import mapPreviewResultToMessage"
);
assert.match(
  pageSource,
  /mapPreviewResultToMessage\(/,
  "FAIL: page must call mapPreviewResultToMessage"
);
assert.match(
  pageSource,
  /errorMessage.*=.*mapPreviewResultToMessage/,
  "FAIL: page must use mapPreviewResultToMessage result for error message"
);
console.log("  ✓ join page calls mapPreviewResultToMessage\n");

// W5: invites list must call splitJoinCodes
console.log("TEST: W5 - invites list uses splitJoinCodes");
const invitesSource = readFileSync(join(__dirname, "..", "src", "app", "owner", "invites", "invites-list.tsx"), "utf-8");
assert.match(
  invitesSource,
  /import.*splitJoinCodes.*from/,
  "FAIL: invites list must import splitJoinCodes"
);
assert.match(
  invitesSource,
  /splitJoinCodes\(codes\)/,
  "FAIL: invites list must call splitJoinCodes with codes"
);
assert.match(
  invitesSource,
  /const\s*{\s*active\s*,\s*inactive\s*}\s*=\s*splitJoinCodes/,
  "FAIL: invites list must destructure active and inactive from splitJoinCodes"
);
console.log("  ✓ invites list calls splitJoinCodes\n");

// W6: confirm button must NOT re-enable after success
console.log("TEST: W6 - confirm button stays disabled after success");
const confirmSource = readFileSync(join(__dirname, "..", "src", "app", "join", "[code]", "join-confirmation.tsx"), "utf-8");

// Extract the handleConfirm function using a more robust pattern
const handleConfirmStart = confirmSource.indexOf("const handleConfirm = async () => {");
assert.ok(handleConfirmStart !== -1, "FAIL: Could not find handleConfirm function");

// Find the matching closing brace by counting braces
let braceCount = 0;
let inFunction = false;
let handleConfirmEnd = -1;

for (let i = handleConfirmStart; i < confirmSource.length; i++) {
  if (confirmSource[i] === "{") {
    braceCount++;
    inFunction = true;
  } else if (confirmSource[i] === "}") {
    braceCount--;
    if (inFunction && braceCount === 0) {
      handleConfirmEnd = i + 1;
      break;
    }
  }
}

assert.ok(handleConfirmEnd !== -1, "FAIL: Could not find end of handleConfirm function");
const handleConfirmBody = confirmSource.substring(handleConfirmStart, handleConfirmEnd);

// Count setRedeeming(false) occurrences
const setRedeemingFalseCount = (handleConfirmBody.match(/setRedeeming\(false\)/g) || []).length;
assert.ok(setRedeemingFalseCount >= 2, "FAIL: handleConfirm must call setRedeeming(false) at least twice (error paths)");

// Ensure setRedeeming(false) is NOT in the success path (after router.push)
const successPathMatch = handleConfirmBody.match(/if\s*\(result\.ok\)\s*\{([^}]+)\}/);
assert.ok(successPathMatch, "FAIL: Could not find success path in handleConfirm");
const successPath = successPathMatch[1];
assert.ok(
  !successPath.includes("setRedeeming(false)"),
  "FAIL: success path must NOT call setRedeeming(false)"
);
assert.match(
  successPath,
  /router\.push/,
  "FAIL: success path must call router.push"
);

// Ensure setRedeeming(false) IS in the error path (else block)
const elseBlockMatch = handleConfirmBody.match(/else\s*\{[^}]*setError\(result\.error\)[^}]*\}/);
assert.ok(elseBlockMatch, "FAIL: Could not find else block in handleConfirm");
assert.match(
  elseBlockMatch[0],
  /setRedeeming\(false\)/,
  "FAIL: else block must call setRedeeming(false)"
);

// Ensure setRedeeming(false) IS in the catch block
const catchBlockMatch = handleConfirmBody.match(/catch[^{]*\{([^}]+)\}/);
assert.ok(catchBlockMatch, "FAIL: Could not find catch block in handleConfirm");
const catchBlock = catchBlockMatch[1];
assert.match(
  catchBlock,
  /setRedeeming\(false\)/,
  "FAIL: catch block must call setRedeeming(false)"
);

console.log("  ✓ confirm button stays disabled after success (only re-enables on error)\n");

console.log("✅ All wiring integrity tests passed");
