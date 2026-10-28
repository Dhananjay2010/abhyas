import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { checkGymOwnership, type GymOwnership } from "@/lib/gym/owner-check";

const NOT_OWNER: GymOwnership = {
  isOwner: false,
  gymId: null,
  gymName: null,
  gymSlug: null,
};

export async function loadSettingsOwnership(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<GymOwnership> {
  try {
    return await checkGymOwnership(supabase, userId);
  } catch {
    return NOT_OWNER;
  }
}

export function OwnerSection({ ownership }: { ownership: GymOwnership }) {
  if (!ownership.isOwner || !ownership.gymId) {
    return null;
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">Gym owner</h2>
      <div className="space-y-3">
        <Link
          href="/owner/branding"
          className="block rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg"
        >
          Branding →
        </Link>
        <Link
          href="/owner/invites"
          className="block rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg"
        >
          Invites &amp; join codes →
        </Link>
      </div>
    </section>
  );
}
