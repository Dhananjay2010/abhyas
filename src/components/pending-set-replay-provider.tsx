"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PendingSetReplay } from "./pending-set-replay";

export type AuthSubscription = {
  unsubscribe: () => void;
};

export type PendingSetReplayProviderViewProps = {
  getUser: () => Promise<{ id: string } | null>;
  onAuthStateChange: (callback: (event: string, session: any) => void) => AuthSubscription;
  getSessionStatus: (sessionId: string) => Promise<"in_progress" | "ended" | "stale">;
};

export function PendingSetReplayProviderView({
  getUser,
  onAuthStateChange,
  getSessionStatus,
}: PendingSetReplayProviderViewProps) {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Load initial user
    async function loadUser() {
      const user = await getUser();
      setUserId(user?.id ?? null);
    }
    
    loadUser();

    // Listen to auth state changes
    const subscription = onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [getUser, onAuthStateChange]);

  if (!userId) return null;

  return <PendingSetReplay userId={userId} getSessionStatus={getSessionStatus} />;
}

/**
 * Provider that mounts PendingSetReplay for authenticated users.
 * This runs once per sign-in on every authenticated page load.
 * Listens to auth state changes to update userId when user signs out/in.
 */
export function PendingSetReplayProvider() {
  async function getUser() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  }

  function onAuthStateChange(callback: (event: string, session: any) => void) {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
    return subscription;
  }

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

  return (
    <PendingSetReplayProviderView
      getUser={getUser}
      onAuthStateChange={onAuthStateChange}
      getSessionStatus={getSessionStatus}
    />
  );
}
