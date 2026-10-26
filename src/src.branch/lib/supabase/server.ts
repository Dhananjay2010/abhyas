import type { Database } from "@/lib/database.types";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { PERF_ENABLED, setPerfRoute, timedFetch } from "@/lib/perf";

/**
 * The request-scoped Supabase client.
 *
 * Wrapped in React's `cache()` so a single render — however many components or
 * helpers ask for a client — builds one client and reads the cookie store
 * once. Each `createServerClient` call constructs a fresh GoTrue instance with
 * its own session state, and the page code calls this helper from several
 * places, so without the cache a render was paying that setup repeatedly.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();
  const fetchImpl = timedFetch();

  if (PERF_ENABLED) {
    // Vercel sets the matched route pattern; locally there is no equivalent, so
    // the log line falls back to the query sequence to identify the page.
    setPerfRoute((await headers()).get("x-matched-path") ?? "");
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; the proxy refreshes the session instead.
          }
        },
      },
    },
  );
});
