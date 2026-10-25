#!/usr/bin/env tsx
/**
 * Test: safeNextPath validation
 * 
 * Behavioral test calling safeNextPath() directly to verify:
 * - Rejects protocol-relative URLs: '//evil.com'
 * - Rejects backslash paths: '/\\evil.com'
 * - Rejects absolute URLs: 'https://evil.com'
 * - Rejects encoded slashes in path: '/%2F%2Fevil'
 * - Accepts valid relative paths: '/today', '/session/abc'
 */

import { safeNextPath } from "../src/lib/safe-next-path";
import { signInAgainHref } from "../src/lib/auth/session-expired";

let exitCode = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ${message}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("Testing safeNextPath validation\n");

// Valid paths should be accepted unchanged
assert(safeNextPath('/today') === '/today', "Accepts '/today'");
assert(safeNextPath('/session/abc') === '/session/abc', "Accepts '/session/abc'");
assert(safeNextPath('/today?x=1') === '/today?x=1', "Accepts '/today?x=1'");
assert(safeNextPath('/history#top') === '/history#top', "Accepts '/history#top'");

// Protocol-relative should be rejected to fallback
assert(safeNextPath('//evil.com') === '/today', "Rejects '//evil.com' (protocol-relative)");
assert(safeNextPath('//evil.com/path') === '/today', "Rejects '//evil.com/path' (protocol-relative)");

// Backslash should be rejected
assert(safeNextPath('/\\evil.com') === '/today', "Rejects '/\\evil.com' (backslash)");
assert(safeNextPath('/\\\\evil.com') === '/today', "Rejects '/\\\\evil.com' (double backslash)");

// Absolute URLs should be rejected
assert(safeNextPath('https://evil.com') === '/today', "Rejects 'https://evil.com' (absolute URL)");
assert(safeNextPath('http://evil.com') === '/today', "Rejects 'http://evil.com' (absolute URL)");

// Encoded slashes in path should be rejected
assert(safeNextPath('/%2F%2Fevil') === '/today', "Rejects '/%2F%2Fevil' (encoded slashes uppercase)");
assert(safeNextPath('/%2f%2fevil') === '/today', "Rejects '/%2f%2fevil' (encoded slashes lowercase)");

// Encoded slashes in query should be accepted
assert(
  safeNextPath('/history?url=http%3A%2F%2Fexample.com') === '/history?url=http%3A%2F%2Fexample.com',
  "Accepts encoded slashes in query string"
);

// Custom fallback
assert(safeNextPath('//evil.com', '/custom') === '/custom', "Custom fallback works");

// Null/undefined
assert(safeNextPath(null) === '/today', "Rejects null");
assert(safeNextPath(undefined) === '/today', "Rejects undefined");
assert(safeNextPath('') === '/today', "Rejects empty string");

// Path too long
const longPath = '/history?x=' + 'a'.repeat(600);
assert(safeNextPath(longPath) === '/today', "Rejects path > 512 characters");

// Test signInAgainHref (which uses safeNextPath)
assert(
  signInAgainHref('/session/abc') === '/?next=%2Fsession%2Fabc',
  "signInAgainHref accepts valid path"
);
assert(
  signInAgainHref('//evil.com') === '/',
  "signInAgainHref rejects protocol-relative"
);
assert(
  signInAgainHref('/\\evil.com') === '/',
  "signInAgainHref rejects backslash"
);
assert(
  signInAgainHref('https://evil.com') === '/',
  "signInAgainHref rejects absolute URL"
);

console.log(exitCode === 0 ? "\n✅ All safeNextPath tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
