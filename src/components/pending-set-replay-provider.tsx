"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PendingSetReplay } from "./pending-set-replay";

/**
 * Provider that mounts PendingSetReplay for authenticated users.
 * This runs once per sign-in on every authenticated page load.
 * Listens to auth state changes to update userId when user signs out/in.
 */
export function PendingSetReplayProvider() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    
    // Load initial user
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    }
    
    loadUser();

    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Get session status for ended sessions
  async function getSessionStatus(sessionId: string): Promise<"in_progress" | "ended" | "stale"> {
    const supabase = createClient();
    const { data } = await supabase
      .from("sessions")
      .select("status")
      .eq("id", sessionId)
      .maybeSingle();
    
    if (!data) return "stale";
    
    // Map DB status to our types
    if (data.status === "in_progress") return "in_progress";
    if (data.status === "completed" || data.status === "skipped" || data.status === "rest") return "ended";
    return "stale";
  }

  if (!userId) return null;

  return <PendingSetReplay userId={userId} getSessionStatus={getSessionStatus} />;
}
