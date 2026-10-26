"use server";

import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { performAccountDeletion, confirmAndDelete } from "./deletion-logic";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";

export type Result = { ok: true } | { ok: false; error: string };

/**
 * Delete the signed-in user's account and all their data.
 * 
 * Server action wrapper that gets authentication context and delegates
 * to the testable deletion logic.
 * 
 * @param confirmation - The user's typed confirmation text
 */
export async function deleteAccount(confirmation: string): Promise<Result> {
  return confirmAndDelete(confirmation, {
    rateLimit: async () => checkActionRateLimit("expensive"),
    deleteAccount: async () => {
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
    },
  });
}
