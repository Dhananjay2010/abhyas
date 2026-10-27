import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { InvitesList } from "./invites-list";
import { resolveTimezoneWithProfile } from "@/lib/timezone";

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

  // Find the gym this user owns
  const { data: ownedMemberships } = await supabase
    .from("gym_memberships")
    .select("gym_id, gyms(id, name, slug)")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .eq("status", "active");

  const ownedGym = ownedMemberships?.[0]?.gyms;
  
  if (!ownedGym || Array.isArray(ownedGym)) {
    redirect("/");
  }

  // Fetch existing join codes for this gym
  const { data: codes } = await supabase
    .from("gym_join_codes")
    .select("*")
    .eq("gym_id", ownedGym.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 pb-28">
      <h1 className="text-3xl font-bold tracking-tight">{ownedGym.name}</h1>
      <p className="mt-2 mb-8 text-sm text-muted">
        Invite members and staff to your gym
      </p>

      <InvitesList gymId={ownedGym.id} gymName={ownedGym.name} initialCodes={codes ?? []} timezone={timezone} />
    </main>
  );
}
