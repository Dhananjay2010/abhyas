"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PendingSetReplay } from "./pending-set-replay";

/**
 * Provider that mounts PendingSetReplay for authenticated users.
 * This runs once per sign-in on every authenticated page load.
 */
export function PendingSetReplayProvider() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    }

    loadUser();
  }, []);

  if (!userId) return null;

  return <PendingSetReplay userId={userId} />;
}
