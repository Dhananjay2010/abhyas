/**
 * The pages hand the PROFILE's units to the shared formatters, so an imperial
 * user sees lb (QA3 MED-3). The formatters themselves are tested in lb by
 * test-wire-logged-sets, test-format-volume-lifted and
 * test-session-summary-banner; this pins the page wiring that feeds them:
 *   - Today: logged sets get getUnitsPreference(profile.units) (kills QA3 W2),
 *     and the profile row is read with select("*") so it includes units;
 *   - Progress: Volume lifted uses formatVolumeLifted(totalVolume!, units)
 *     with units from the profile row that selects units (kills QA3 V1);
 *   - Session: SessionRunner gets units from profiles.units (summary volume).
 *
 * Server components with live Supabase can't be rendered here, so these are
 * source assertions on the exact wiring, like test-wire-logged-sets' page
 * check.
 */
import fs from "fs";
import path from "path";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`  ${pass ? "✓" : "✗ FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");

console.log("Page units wiring\n");

console.log("1. Today (src/app/today/page.tsx)");
{
  const src = read("src/app/today/page.tsx");
  check("logged sets use the profile's units",
    /logged:\s*loggedSetsRes\?\.data\s*\?\s*\{\s*exercises:\s*loggedSetsRes\.data,\s*units:\s*getUnitsPreference\(profile\.units\)\s*\}/.test(src));
  check("the profile row includes units (select *)",
    /from\("profiles"\)\s*\.select\("\*"\)/.test(src));
}

console.log("\n2. Progress (src/app/progress/page.tsx)");
{
  const src = read("src/app/progress/page.tsx");
  check("Volume lifted is formatted in the user's units",
    /formatVolumeLifted\(totalVolume!,\s*units\)/.test(src) && !/formatVolumeLifted\([^)]*"(metric|imperial)"\)/.test(src));
  check("units come from the profile",
    /const units = getUnitsPreference\(profile\.units\);/.test(src));
  check("the profile select includes units",
    /from\("profiles"\)\s*\.select\("[^"]*\bunits\b[^"]*"\)/.test(src));
}

console.log("\n3. Session (src/app/session/[id]/page.tsx)");
{
  const src = read("src/app/session/[id]/page.tsx");
  check("SessionRunner gets the profile's units",
    /<SessionRunner[\s\S]*?units=\{getUnitsPreference\(profileRes\.data\?\.units\)\}[\s\S]*?\/>/.test(src));
  check("the profile select includes units",
    /from\("profiles"\)\s*\.select\("[^"]*\bunits\b[^"]*"\)/.test(src));
}

if (failures > 0) {
  console.log(`\n✗ ${failures} check(s) failed`);
  process.exit(1);
}
console.log("\n✓ All page units wiring checks passed");
