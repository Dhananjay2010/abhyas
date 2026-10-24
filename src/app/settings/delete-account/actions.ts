"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthedClient } from "@/lib/supabase/auth";
import { performAccountDeletion, authCookieNames } from "./deletion-logic";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";
import { isDeleteConfirmed } from "./form-logic";

export type Result = { ok: true } | { ok: false; error: string };

/**
 * Delete the signed-in user's account and all their data.
 * 
 * Server action wrapper that gets authentication context and delegates
 * to the testable deletion logic.
 * 
 * @param confirmation - The user's typed confirmation text (must be exactly "DELETE")
 */
export async function deleteAccount(confirmation: string): Promise<Result> {
  // Check confirmation first, before rate limiting or any other checks
  if (!isDeleteConfirmed(confirmation)) {
    return { ok: false, error: "Type DELETE to confirm." };
  }

  const rateLimit = await checkActionRateLimit("expensive");
  if (rateLimit) return rateLimit;

  const { supabase, user } = await getAuthedClient();
  
  return performAccountDeletion({
    user,
    callRPC: async () => {
      // Type assertion needed because the database types are not yet regenerated
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (supabase.rpc as any)("delete_own_account");
    },
    signOut: async () => {
      // Use local scope since the user no longer exists in the database
      // This avoids a server call that would fail
      const result = await supabase.auth.signOut({ scope: "local" });
      
      // Explicitly delete all Supabase auth cookies
      // This ensures complete sign-out even if the local sign-out has issues
      const cookieStore = await cookies();
      const allCookieNames = (await cookieStore).getAll().map(c => c.name);
      const authCookies = authCookieNames(allCookieNames);
      
      for (const cookieName of authCookies) {
        (await cookieStore).delete(cookieName);
      }
      
      return result;
    },
    redirect: () => {
      redirect("/");
    },
  });
}
