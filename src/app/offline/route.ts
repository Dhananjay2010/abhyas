/**
 * Offline fallback page route handler.
 *
 * Serves the generated offline.html as a response. This keeps /offline working
 * as a public route (listed in public-paths.ts) while the actual HTML is
 * generated from branding configuration and gitignored.
 */

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export async function GET() {
  const offlinePath = path.join(process.cwd(), "public", "offline.html");
  
  try {
    const html = fs.readFileSync(offlinePath, "utf-8");
    
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch {
    // Fallback if offline.html doesn't exist (shouldn't happen in production)
    return new NextResponse(
      "<!DOCTYPE html><html><body><h1>Offline</h1><p>No internet connection.</p></body></html>",
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
        status: 503,
      }
    );
  }
}
