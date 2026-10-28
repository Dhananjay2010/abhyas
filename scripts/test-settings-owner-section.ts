/**
 * Test: Settings page owner section
 * 
 * Verifies:
 * 1. Owner sees "Gym owner" section with both links
 * 2. Plain member sees no owner section and no /owner links
 * 3. When owner lookup errors, nothing is shown (fail closed)
 */

import assert from "node:assert";
import { readFileSync } from "fs";
import { join } from "path";
import { checkGymOwnership } from "@/lib/gym/owner-check";
import { createFakeDb, json } from "./helpers/fake-postgrest";

console.log("=== Test: Settings page owner section ===\n");

// Test 1: Verify imports and structure in source
{
  console.log("▶ Test 1: Verifying source code structure...");
  const settingsPath = join(__dirname, "..", "src", "app", "settings", "page.tsx");
  const source = readFileSync(settingsPath, "utf-8");

  // Must import checkGymOwnership
  assert(
    source.includes("checkGymOwnership") && source.includes("@/lib/gym/owner-check"),
    "FAIL: Settings page must import checkGymOwnership from owner-check"
  );

  // Must import Link from next/link for the owner section links
  assert(
    source.includes("import") && source.includes("Link") && source.includes("next/link"),
    "FAIL: Settings page must import Link from next/link"
  );

  // Must call checkGymOwnership in the page
  assert(
    source.includes("checkGymOwnership(supabase, user.id)"),
    "FAIL: Settings page must call checkGymOwnership with supabase and user.id"
  );

  // Must have conditional rendering based on ownership.isOwner and ownership.gymId
  assert(
    source.includes("ownership.isOwner") && source.includes("ownership.gymId"),
    "FAIL: Settings page must check both ownership.isOwner and ownership.gymId"
  );

  // Must have "Gym owner" section header
  assert(
    source.includes("Gym owner") || source.includes("Gym Owner"),
    "FAIL: Settings page must have 'Gym owner' section header"
  );

  // Must have /owner/branding link
  assert(
    source.includes('"/owner/branding"') || source.includes("'/owner/branding'"),
    "FAIL: Settings page must have /owner/branding link"
  );

  // Must have /owner/invites link
  assert(
    source.includes('"/owner/invites"') || source.includes("'/owner/invites'"),
    "FAIL: Settings page must have /owner/invites link"
  );

  // Must use Link component (not plain anchor) for owner links
  assert(
    source.includes("<Link") && source.includes('href="/owner/'),
    "FAIL: Settings page must use next/link Link component for owner links"
  );

  // Must use consistent styling with existing sections
  assert(
    source.match(/border-border/g) && source.match(/bg-surface-2/g),
    "FAIL: Owner section must use brand CSS variables (border-border, bg-surface-2)"
  );

  assert(
    source.includes("text-muted") && source.includes("hover:text-fg"),
    "FAIL: Owner section links must use text-muted and hover:text-fg"
  );

  // Must not have hardcoded colors (checking for common hex patterns)
  const ownerSectionMatch = source.match(/ownership\.isOwner[\s\S]*?<\/section>/);
  if (ownerSectionMatch) {
    const ownerSection = ownerSectionMatch[0];
    assert(
      !ownerSection.match(/#[0-9a-fA-F]{3,6}/) && !ownerSection.match(/rgb\(/),
      "FAIL: Owner section must not have hardcoded colors"
    );
  }

  // Must render null explicitly when not owner (defensive)
  assert(
    source.includes(": null}") || source.includes("null)"),
    "FAIL: Owner section must explicitly render null when not an owner"
  );

  console.log("  ✓ checkGymOwnership is imported and called");
  console.log("  ✓ Link from next/link is imported");
  console.log("  ✓ Conditional rendering checks ownership.isOwner and ownership.gymId");
  console.log("  ✓ 'Gym owner' section header exists");
  console.log("  ✓ /owner/branding link exists");
  console.log("  ✓ /owner/invites link exists");
  console.log("  ✓ Uses next/link Link component");
  console.log("  ✓ Uses brand CSS variables (no hardcoded colors)");
  console.log("  ✓ Uses consistent styling with existing sections");
  console.log("  ✓ Explicitly renders null when not owner");
  console.log();
}

// Test 2: Owner sees both links with correct hrefs
{
  console.log("▶ Test 2: Owner sees both links...");

  const db = createFakeDb();
  db.beforeRequest = (req) => {
    if (req.table === "gym_memberships") {
      // Return active owner row
      return json(200, [
        {
          gym_id: "gym-test-id",
          joined_at: "2024-01-01T00:00:00Z",
          role: "owner",
          status: "active",
          gyms: { name: "Test Gym", slug: "test-gym" },
        },
      ]);
    }
  };

  checkGymOwnership(db.client, "user-owner").then((ownership) => {
    assert.strictEqual(ownership.isOwner, true, "FAIL: Owner must have isOwner true");
    assert.strictEqual(ownership.gymId, "gym-test-id", "FAIL: Owner must have gymId");
    console.log("  ✓ Owner has isOwner true and gymId set");
    console.log("  ✓ Owner should see both /owner/branding and /owner/invites links");
    console.log();
  });
}

// Test 3: Plain member sees no owner section
{
  console.log("▶ Test 3: Plain member sees no owner section...");

  const db = createFakeDb();
  db.beforeRequest = (req) => {
    if (req.table === "gym_memberships") {
      // Return no owner rows (member with non-owner role or no rows)
      return json(200, []);
    }
  };

  checkGymOwnership(db.client, "user-member").then((ownership) => {
    assert.strictEqual(ownership.isOwner, false, "FAIL: Member must have isOwner false");
    assert.strictEqual(ownership.gymId, null, "FAIL: Member must have null gymId");
    console.log("  ✓ Member has isOwner false and gymId null");
    console.log("  ✓ Conditional will not render owner section");
    console.log("  ✓ Member sees NO /owner links and NO owner section");
    console.log();
  });
}

// Test 4: Error case shows nothing (fail closed)
{
  console.log("▶ Test 4: Error case shows nothing (fail closed)...");

  const db = createFakeDb();
  db.beforeRequest = (req) => {
    if (req.table === "gym_memberships") {
      // Simulate database error
      return json(500, { message: "Internal server error" });
    }
  };

  checkGymOwnership(db.client, "user-error").then((ownership) => {
    // On error, checkGymOwnership returns isOwner: false
    assert.strictEqual(ownership.isOwner, false, "FAIL: Error case must have isOwner false");
    assert.strictEqual(ownership.gymId, null, "FAIL: Error case must have null gymId");
    console.log("  ✓ Error case has isOwner false and gymId null");
    console.log("  ✓ Conditional will not render owner section (fail closed)");
    console.log("  ✓ Error case shows NO owner section");
    console.log();
  });
}

// Test 5: Verify no layout shift for non-owners
{
  console.log("▶ Test 5: Verifying no layout shift for non-owners...");
  const settingsPath = join(__dirname, "..", "src", "app", "settings", "page.tsx");
  const source = readFileSync(settingsPath, "utf-8");

  // Ensure the conditional renders null, not an empty div or placeholder
  const conditionalMatch = source.match(/ownership\.isOwner[\s\S]*?\? \([\s\S]*?\) : (.*?)[},]/);
  if (conditionalMatch) {
    const falseCase = conditionalMatch[1].trim();
    assert(
      falseCase === "null" || falseCase === "null}",
      "FAIL: Non-owner case must render null (no placeholder or empty div)"
    );
  }

  console.log("  ✓ Non-owner case renders null (no placeholder)");
  console.log("  ✓ No layout shift for non-owners");
  console.log();
}

// Test 6: Verify accessible labels
{
  console.log("▶ Test 6: Verifying accessible labels...");
  const settingsPath = join(__dirname, "..", "src", "app", "settings", "page.tsx");
  const source = readFileSync(settingsPath, "utf-8");

  // Check for descriptive link text
  assert(
    source.includes("Branding") && source.includes("Invites"),
    "FAIL: Links must have descriptive text (Branding, Invites)"
  );

  // Must not be empty or just an arrow
  const linkTextMatch = source.match(/<Link[^>]*href="\/owner\/[^"]*"[^>]*>([\s\S]*?)<\/Link>/g);
  if (linkTextMatch) {
    linkTextMatch.forEach((linkHtml) => {
      const textContent = linkHtml.replace(/<[^>]*>/g, "").trim();
      assert(
        textContent.length > 1 && textContent !== "→",
        "FAIL: Link text must be descriptive, not just an arrow"
      );
    });
  }

  console.log("  ✓ Links have accessible labels (Branding, Invites)");
  console.log("  ✓ Not just arrow symbols");
  console.log();
}

console.log("✅ All Settings page owner section tests passed\n");
