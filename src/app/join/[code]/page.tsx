import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { JoinConfirmation } from "./join-confirmation";
import { parsePreviewJoinCodeResult } from "@/lib/gym-join-code-types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function JoinPage({ params }: PageProps) {
  const resolvedParams = await params;
  const code = resolvedParams.code;
  
  const { supabase, user } = await getAuthedClient();
  
  if (!user) {
    redirect(`/?next=${encodeURIComponent(`/join/${code}`)}`);
  }

  // Preview the join code
  const { data: previewData } = await supabase.rpc("preview_join_code", {
    p_code: code,
  });

  // Parse jsonb result with type guard
  const result = parsePreviewJoinCodeResult(previewData);

  if (!result || !result.ok) {
    const reason = result?.ok === false ? result.reason : "invalid";
    const isThrottled = reason === "throttled";
    
    return (
      <main className="mx-auto w-full max-w-md px-6 py-10">
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-6 py-8 text-center">
          <h1 className="text-2xl font-bold text-danger">
            {isThrottled ? "Too Many Attempts" : "Invalid Invite Code"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {isThrottled
              ? "You've made too many attempts. Please try again in a few minutes."
              : "This invite code is invalid, expired, or no longer available."}
          </p>
        </div>
      </main>
    );
  }

  const { gym_name, gym_slug, role } = result;

  // Check current gym membership(s)
  const { data: currentMemberships } = await supabase
    .from("gym_memberships")
    .select("gym_id, role, status, gyms(name, slug)")
    .eq("user_id", user.id)
    .eq("status", "active");

  // Find role in THIS code's gym specifically
  const codeGymMembership = currentMemberships?.find(
    m => m.gyms && !Array.isArray(m.gyms) && m.gyms.slug === gym_slug
  );
  const codeGymRole = codeGymMembership?.role;

  // Find current gym (prefer owner > staff > member, exclude default gym unless it's the only one)
  const sortedMemberships = currentMemberships?.filter(
    m => m.gyms && !Array.isArray(m.gyms)
  ).sort((a, b) => {
    // Role priority: owner (0) > staff (1) > member (2)
    const roleOrder = { owner: 0, staff: 1, member: 2 };
    return (roleOrder[a.role] ?? 999) - (roleOrder[b.role] ?? 999);
  });
  
  const currentGym = sortedMemberships?.find(
    m => m.gyms && !Array.isArray(m.gyms) && m.gyms.slug !== "default"
  ) ?? sortedMemberships?.[0];

  // Check if user has an active member membership in another gym (will be moved if joining as member)
  const otherMemberMembership = currentMemberships?.find(
    m => m.gyms && !Array.isArray(m.gyms) && m.gyms.slug !== gym_slug && m.role === "member"
  );
  const otherMemberGymName = otherMemberMembership?.gyms && !Array.isArray(otherMemberMembership.gyms) 
    ? otherMemberMembership.gyms.name 
    : null;

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10">
      <JoinConfirmation
        code={code}
        gymName={gym_name || ""}
        role={role as "member" | "staff" | "owner"}
        currentGymName={currentGym?.gyms && !Array.isArray(currentGym.gyms) ? currentGym.gyms.name : null}
        currentGymRole={currentGym?.role}
        codeGymRole={codeGymRole}
        otherMemberGymName={otherMemberGymName}
      />
    </main>
  );
}
