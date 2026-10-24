"use server";

import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { performAccountDeletion } from "./deletion-logic";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";

export type Result = { ok: true } | { ok: false; error: string };

/**
 * Delete the signed-in user's account and all their data.
 * 
 * Server action wrapper that gets authentication context and delegates
 * to the testable deletion logic.
 */
export async function deleteAccount(): Promise<Result> {
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
      await supabase.auth.signOut();
    },
    redirect: () => {
      redirect("/");
    },
  });
}
