import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { JoinConfirmation } from "./join-confirmation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function JoinPage({ params }: PageProps) {
  const resolvedParams = await params;
  const code = resolvedParams.code;
  
  const { supabase, user } = await getAuthedClient();
  
  if (!user) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(`/join/${code}`)}`);
  }

  // Preview the join code
  const { data: preview } = await supabase.rpc("preview_join_code", {
    p_code: code,
  });

  if (!preview || preview.length === 0) {
    return (
      <main className="mx-auto w-full max-w-md px-6 py-10">
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-6 py-8 text-center">
          <h1 className="text-2xl font-bold text-danger">Invalid Invite Code</h1>
          <p className="mt-2 text-sm text-muted">
            This invite code is invalid, expired, or no longer available.
          </p>
        </div>
      </main>
    );
  }

  const { gym_name, gym_slug, role } = preview[0];

  // Check current gym membership(s)
  const { data: currentMemberships } = await supabase
    .from("gym_memberships")
    .select("gym_id, role, status, gyms(name, slug)")
    .eq("user_id", user.id)
    .eq("status", "active");

  // Find non-default active member-role gym
  const currentMemberGym = currentMemberships?.find(
    m => m.role === "member" && m.gyms && !Array.isArray(m.gyms) && m.gyms.slug !== "default"
  );

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10">
      <JoinConfirmation
        code={code}
        gymName={gym_name}
        role={role}
        currentMemberGym={currentMemberGym?.gyms && !Array.isArray(currentMemberGym.gyms) ? currentMemberGym.gyms.name : null}
      />
    </main>
  );
}
