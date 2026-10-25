/**
 * Lets a tsx test import the REAL server actions in src/app/session/actions.ts.
 *
 * The actions file pulls in request-scoped Next.js modules (cookies, headers,
 * revalidatePath) that cannot run outside a request. This replaces only those
 * edges -- auth, the rate limiter and revalidation -- with stubs, so the action
 * bodies themselves run unmodified against whatever client the test supplies.
 *
 * Call installServerActionStubs() BEFORE the first `await import(...)` of the
 * actions module.
 */
import Module from "node:module";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";

type Loader = (request: string, parent: unknown, isMain: boolean) => unknown;

export type StubState = {
  client: SupabaseClient<Database> | null;
  userId: string;
};

export const stubState: StubState = { client: null, userId: "user-1" };

function hasLoader(m: object): m is { _load: Loader } {
  return "_load" in m && typeof m._load === "function";
}

export function installServerActionStubs(): void {
  const stubs: Record<string, unknown> = {
    "@/lib/supabase/auth": {
      getAuthedClient: async () => ({ supabase: stubState.client, user: { id: stubState.userId, email: null } }),
      getSessionUser: async () => ({ id: stubState.userId, email: null }),
      readClaims: async () => ({ id: stubState.userId, email: null }),
    },
    "@/lib/rate-limit/server-action": {
      checkActionRateLimit: async () => null,
    },
    "@/lib/revalidate": {
      revalidateTrainingData: () => {},
    },
  };
  const mod: object = Module;
  if (!hasLoader(mod)) throw new Error("node:module has no _load hook to stub");
  const original = mod._load;
  mod._load = (request, parent, isMain) =>
    request in stubs ? stubs[request] : original.call(Module, request, parent, isMain);
}
