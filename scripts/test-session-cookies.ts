/**
 * Test: Session cookie preservation during redirects
 *
 * Validates that copyCookies correctly transfers cookies from one NextResponse
 * to another, preserving all cookie attributes (path, domain, httpOnly, etc.).
 *
 * This ensures that when the proxy redirects an unauthenticated request, any
 * cookies that Supabase set (like clearing expired tokens) aren't lost.
 *
 * Run: npx tsx scripts/test-session-cookies.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { copyCookies, buildRedirectQuery } from "../src/lib/auth/redirect";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

console.log("\n1. Basic cookie copying with real NextResponse");
{
  const req = new NextRequest("https://example.com/test");
  const source = NextResponse.next({ request: req });
  const dest = NextResponse.redirect("https://example.com/");

  source.cookies.set("test-cookie", "value123", { path: "/" });
  copyCookies(source, dest);

  const copied = dest.cookies.get("test-cookie");
  check("copies cookie name and value", copied?.value === "value123");
  check("preserves path", copied?.path === "/");
}

console.log("\n2. Cookie with all attributes");
{
  const req = new NextRequest("https://example.com/test");
  const source = NextResponse.next({ request: req });
  const dest = NextResponse.redirect("https://example.com/");

  source.cookies.set("auth-token", "abc123", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 3600,
  });
  copyCookies(source, dest);

  const copied = dest.cookies.get("auth-token");
  check("copies cookie value", copied?.value === "abc123");
  check("preserves path", copied?.path === "/");
  check("preserves httpOnly", copied?.httpOnly === true);
  check("preserves secure", copied?.secure === true);
  check("preserves sameSite", copied?.sameSite === "lax");
  check("preserves maxAge", copied?.maxAge === 3600);
}

console.log("\n3. Multiple cookies");
{
  const req = new NextRequest("https://example.com/test");
  const source = NextResponse.next({ request: req });
  const dest = NextResponse.redirect("https://example.com/");

  source.cookies.set("cookie1", "val1");
  source.cookies.set("cookie2", "val2");
  source.cookies.set("cookie3", "val3");
  copyCookies(source, dest);

  check("copies cookie1", dest.cookies.get("cookie1")?.value === "val1");
  check("copies cookie2", dest.cookies.get("cookie2")?.value === "val2");
  check("copies cookie3", dest.cookies.get("cookie3")?.value === "val3");
}

console.log("\n4. Deletion cookie with maxAge=0");
{
  const req = new NextRequest("https://example.com/test");
  const source = NextResponse.next({ request: req });
  const dest = NextResponse.redirect("https://example.com/");

  // Clearing a cookie sets maxAge=0
  source.cookies.set("old-token", "", { maxAge: 0, path: "/" });
  copyCookies(source, dest);

  const cleared = dest.cookies.get("old-token");
  check("copies cleared cookie", cleared?.value === "");
  check("preserves maxAge=0", cleared?.maxAge === 0);
  check("preserves path on deletion", cleared?.path === "/");
}

console.log("\n5. Chunked cookies (Supabase pattern)");
{
  const req = new NextRequest("https://example.com/test");
  const source = NextResponse.next({ request: req });
  const dest = NextResponse.redirect("https://example.com/");

  // Supabase uses chunked cookies for large sessions
  source.cookies.set("sb-token.0", "part1", { path: "/", sameSite: "lax" });
  source.cookies.set("sb-token.1", "part2", { path: "/", sameSite: "lax" });
  copyCookies(source, dest);

  const chunk0 = dest.cookies.get("sb-token.0");
  const chunk1 = dest.cookies.get("sb-token.1");
  check("copies first chunk", chunk0?.value === "part1");
  check("preserves sameSite on chunk0", chunk0?.sameSite === "lax");
  check("copies second chunk", chunk1?.value === "part2");
  check("preserves sameSite on chunk1", chunk1?.sameSite === "lax");
}

console.log("\n6. buildRedirectQuery tests");
{
  const origin = "https://abhyas-indol.vercel.app";
  
  // Valid path with query
  const q1 = buildRedirectQuery("/session/abc", "?x=1", origin);
  check("keeps path and query", q1 === "?next=%2Fsession%2Fabc%3Fx%3D1", `got: ${q1}`);
  
  // Protocol-relative URL
  const q2 = buildRedirectQuery("//evil.example", "", origin);
  check("rejects // (falls back to /today)", q2 === "?next=%2Ftoday", `got: ${q2}`);
  
  // Backslash
  const q3 = buildRedirectQuery("/\\evil", "", origin);
  check("rejects /\\ (falls back to /today)", q3 === "?next=%2Ftoday", `got: ${q3}`);
  
  // Encoding round-trip
  const q4 = buildRedirectQuery("/today", "", origin);
  const decoded = decodeURIComponent(q4.replace("?next=", ""));
  check("encoding round-trip preserves /today", decoded === "/today", `got: ${decoded}`);
}

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
