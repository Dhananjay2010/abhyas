#!/usr/bin/env tsx

/**
 * Unit tests for Sentry disclosure logic.
 * 
 * Tests the REAL sentry-disclosure functions to verify:
 * - isSentryEnabled returns true only when NEXT_PUBLIC_SENTRY_DSN is set
 * - getErrorMonitoringDisclosure returns appropriate content based on config
 */

import { isSentryEnabled, getErrorMonitoringDisclosure } from "../src/lib/legal/sentry-disclosure";

export {}; // Make this a module to avoid global scope conflicts

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nSentry disclosure tests");
console.log("=======================\n");

function runTests() {
  console.log("1. isSentryEnabled when DSN is not set");
  {
    // Save and clear the env var
    const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    
    const enabled = isSentryEnabled();
    check("returns false", enabled === false);
    
    // Restore
    if (originalDsn !== undefined) {
      process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
    }
  }

  console.log("\n2. isSentryEnabled when DSN is empty string");
  {
    const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    process.env.NEXT_PUBLIC_SENTRY_DSN = "";
    
    const enabled = isSentryEnabled();
    check("returns false", enabled === false);
    
    if (originalDsn !== undefined) {
      process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
    } else {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    }
  }

  console.log("\n3. isSentryEnabled when DSN is set");
  {
    const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://example@sentry.io/123";
    
    const enabled = isSentryEnabled();
    check("returns true", enabled === true);
    
    if (originalDsn !== undefined) {
      process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
    } else {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    }
  }

  console.log("\n4. getErrorMonitoringDisclosure when Sentry is disabled");
  {
    const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    
    const disclosure = getErrorMonitoringDisclosure();
    check("enabled is false", disclosure.enabled === false);
    check("processorName is null", disclosure.processorName === null);
    check("description is generic", disclosure.description.includes("Error logs may be collected"));
    check("description excludes PII", disclosure.description.includes("personally identifiable information excluded"));
    check("description does not mention Sentry", !disclosure.description.includes("Sentry"));
    
    if (originalDsn !== undefined) {
      process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
    }
  }

  console.log("\n5. getErrorMonitoringDisclosure when Sentry is enabled");
  {
    const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://example@sentry.io/123";
    
    const disclosure = getErrorMonitoringDisclosure();
    check("enabled is true", disclosure.enabled === true);
    check("processorName is Sentry", disclosure.processorName === "Sentry");
    check("description mentions error monitoring", disclosure.description.includes("error monitoring"));
    check("description mentions diagnostics", disclosure.description.includes("diagnostics"));
    check("description mentions PII scrubbing", disclosure.description.includes("personally identifiable information scrubbed"));
    check("description mentions Sentry's privacy policy", disclosure.description.includes("Sentry's privacy policy"));
    
    if (originalDsn !== undefined) {
      process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
    } else {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    }
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

runTests();
