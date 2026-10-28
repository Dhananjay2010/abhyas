import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { InvitesList } from "./invites-list";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { checkGymOwnership } from "@/lib/gym/owner-check";

export const dynamic = "force-dynamic";

export default async function OwnerInvitesPage() {
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();

  const timezone = resolveTimezoneWithProfile(profile?.timezone);

  // Check if user is an owner
  const ownership = await checkGymOwnership(supabase, user.id);
  
  if (!ownership.isOwner || !ownership.gymId || !ownership.gymName) {
    redirect("/");
  }

  // Fetch existing join codes for this gym
  const { data: codes } = await supabase
    .from("gym_join_codes")
    .select("*")
    .eq("gym_id", ownership.gymId)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 pb-28">
      <h1 className="text-3xl font-bold tracking-tight">{ownership.gymName}</h1>
      <p className="mt-2 mb-8 text-sm text-muted">
        Invite members and staff to your gym
      </p>

      <InvitesList gymId={ownership.gymId} initialCodes={codes ?? []} timezone={timezone} />
    </main>
  );
}
