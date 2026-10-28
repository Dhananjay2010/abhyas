#!/usr/bin/env tsx
/**
 * CLI wrapper for provision_gym RPC.
 * Calls provision_gym via supabase-js with the service-role key from env.
 * 
 * REFUSES any SUPABASE_URL that isn't localhost/127.0.0.1/::1 unless
 * --i-know-this-is-not-local is passed, and even then prints a loud warning.
 * 
 * Never reads or prints a key value.
 * 
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   tsx scripts/provision-gym.ts <name> <slug> <timezone> <owner_email> \
 *     [display_name] [primary_color] [accent_color] [logo_url]
 * 
 * Example:
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... \
 *   tsx scripts/provision-gym.ts "Test Gym" test-gym Asia/Kolkata owner@example.com
 */

import { createClient } from "@supabase/supabase-js";
import { isLocalhostUrl } from "./lib-provision-gym-url-guard";

async function main() {
  const args = process.argv.slice(2);

  // Check for override flag
  const overrideIndex = args.indexOf("--i-know-this-is-not-local");
  const hasOverride = overrideIndex !== -1;
  if (hasOverride) {
    args.splice(overrideIndex, 1);
  }

  if (args.length < 4) {
    console.error("Usage: provision-gym.ts <name> <slug> <timezone> <owner_email> [display_name] [primary_color] [accent_color] [logo_url]");
    console.error("");
    console.error("Example:");
    console.error('  provision-gym.ts "Test Gym" test-gym Asia/Kolkata owner@example.com');
    console.error('  provision-gym.ts "Branded Gym" branded-gym Asia/Kolkata owner@example.com "Display Name" "#FF6B35" "#C1440E" "https://example.com/logo.png"');
    process.exit(1);
  }

  const [name, slug, timezone, ownerEmail, displayName, primaryColor, accentColor, logoUrl] = args;

  const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceRoleKey) {
    console.error("Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required");
    process.exit(1);
  }

  // Check if URL is localhost/127.0.0.1/::1
  const isLocalhost = isLocalhostUrl(supabaseUrl);

  if (!isLocalhost && !hasOverride) {
    console.error("");
    console.error("❌ SAFETY CHECK FAILED");
    console.error("");
    console.error(`SUPABASE_URL is NOT localhost/127.0.0.1/::1: ${supabaseUrl}`);
    console.error("");
    console.error("This script will call provision_gym with the service-role key,");
    console.error("which can create gyms and memberships on the target database.");
    console.error("");
    console.error("If you understand the risk and want to proceed, add:");
    console.error("  --i-know-this-is-not-local");
    console.error("");
    process.exit(1);
  }

  if (!isLocalhost && hasOverride) {
    console.warn("");
    console.warn("⚠️  WARNING: Running against NON-LOCAL database");
    console.warn("");
    console.warn(`SUPABASE_URL: ${supabaseUrl}`);
    console.warn("");
    console.warn("You passed --i-know-this-is-not-local. Proceeding...");
    console.warn("");
  }

  // Never read or print the key value
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  console.log(`Provisioning gym: ${name} (${slug})`);
  console.log(`Timezone: ${timezone}`);
  console.log(`Owner email: ${ownerEmail}`);
  if (displayName) console.log(`Display name: ${displayName}`);
  if (primaryColor) console.log(`Primary color: ${primaryColor}`);
  if (accentColor) console.log(`Accent color: ${accentColor}`);
  if (logoUrl) console.log(`Logo URL: ${logoUrl}`);
  console.log("");

  const { data, error } = await supabase.rpc("provision_gym", {
    p_name: name,
    p_slug: slug,
    p_timezone: timezone,
    p_owner_email: ownerEmail,
    p_display_name: displayName || null,
    p_primary_color: primaryColor || null,
    p_accent_color: accentColor || null,
    p_logo_url: logoUrl || null,
  });

  if (error) {
    console.error("Error provisioning gym:");
    console.error(error);
    process.exit(1);
  }

  console.log("✅ Success");
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
