#!/usr/bin/env tsx
/**
 * Test: session-expired-shim safeNextPath function
 * 
 * Verifies the shim's safeNextPath implementation rejects:
 * - '//evil.com' (protocol-relative)
 * - '/\\evil.com' (backslash)
 * - 'https://evil.com' (absolute URL)
 * - '/%2F%2Fevil' (encoded slashes)
 * 
 * And accepts:
 * - '/session/abc' (valid path)
 */

// Import the shim module - need to access the internal safeNextPath
// Since it's not exported, we'll test through signInAgainHref which uses it
import { signInAgainHref } from "../src/lib/session/session-expired-shim";
import { readFileSync } from "fs";

let exitCode = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ${message}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("Testing session-expired-shim safeNextPath\n");

// First check that the shim's safeNextPath actually checks for '//'
const shimCode = readFileSync("src/lib/session/session-expired-shim.tsx", "utf-8");
const safeNextPathCode = shimCode.split('function safeNextPath')[1]?.split('function ')[0] || '';
const protocolRelativeLine = safeNextPathCode.split('\n').find(line => 
  line.includes("startsWith('//')") || line.includes('startsWith("//")')
);
assert(
  !!protocolRelativeLine &&
  !protocolRelativeLine.trim().startsWith('//') &&
  /if\s*\(\s*path\.startsWith\s*\(\s*['"]\/{2}['"]/.test(protocolRelativeLine),
  "safeNextPath must have an active if (path.startsWith('//')) check, not if (false)"
);

// Test through signInAgainHref since safeNextPath is internal
// signInAgainHref calls safeNextPath and returns /?next=encoded(result)

// Valid path should be preserved
const validResult = signInAgainHref('/session/abc');
assert(validResult === '/?next=%2Fsession%2Fabc', "Valid path '/session/abc' accepted");

// Protocol-relative should be rejected to fallback
const protoRelResult = signInAgainHref('//evil.com');
assert(protoRelResult === '/?next=%2Ftoday', "Protocol-relative '//evil.com' rejected");

// Backslash should be rejected
const backslashResult = signInAgainHref('/\\evil.com');
assert(backslashResult === '/?next=%2Ftoday', "Backslash '/\\evil.com' rejected");

// Absolute URL should be rejected  
const httpsResult = signInAgainHref('https://evil.com');
assert(httpsResult === '/?next=%2Ftoday', "Absolute URL 'https://evil.com' rejected");

// Encoded slashes should be rejected
const encodedResult = signInAgainHref('/%2F%2Fevil');
assert(encodedResult === '/?next=%2Ftoday', "Encoded slashes '/%2F%2Fevil' rejected");

// Another valid path
const validResult2 = signInAgainHref('/today');
assert(validResult2 === '/?next=%2Ftoday', "Valid path '/today' accepted");

console.log(exitCode === 0 ? "\n✅ All shim safe-next-path tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
