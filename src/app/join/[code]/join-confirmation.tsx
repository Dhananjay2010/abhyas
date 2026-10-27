"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { redeemJoinCode } from "./actions";
import type { Database } from "@/lib/database.types";

type GymRole = Database["public"]["Enums"]["gym_role"];

interface JoinConfirmationProps {
  code: string;
  gymName: string;
  role: GymRole;
  currentGymName: string | null;
  currentGymRole?: GymRole;
  codeGymRole?: GymRole;
  otherMemberGymName?: string | null;
}

export function JoinConfirmation({
  code,
  gymName,
  role,
  currentGymName,
  currentGymRole,
  codeGymRole,
  otherMemberGymName,
}: JoinConfirmationProps) {
  const router = useRouter();
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine if user is already in code's gym at same or higher role
  const roleOrder = { owner: 3, staff: 2, member: 1 };
  const alreadyInAtSameOrHigher = codeGymRole && 
    (roleOrder[codeGymRole] ?? 0) >= (roleOrder[role] ?? 0);
  
  // Determine if this is a member->staff upgrade case
  const isMemberUpgradeToStaff = codeGymRole === "member" && role === "staff";

  const handleConfirm = async () => {
    setRedeeming(true);
    setError(null);

    try {
      const result = await redeemJoinCode(code);

      if (result.ok) {
        router.push("/today");
      } else {
        setError(result.error);
      }
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface-2 px-6 py-8 text-center">
        {alreadyInAtSameOrHigher ? (
          <>
            <h1 className="text-2xl font-bold">Already in {gymName}</h1>
            <p className="mt-3 text-sm text-muted">
              You are already part of this gym as <strong>{codeGymRole}</strong>
            </p>
          </>
        ) : isMemberUpgradeToStaff ? (
          <>
            <h1 className="text-2xl font-bold">Join {gymName} as staff?</h1>
            <p className="mt-3 text-sm text-muted">
              You are currently a <strong>member</strong> of this gym. This code will upgrade you to <strong>staff</strong>.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Join {gymName}?</h1>
            <p className="mt-3 text-sm text-muted">
              You will join as a <strong>{role}</strong>
            </p>
            {currentGymName && role === "member" && currentGymRole === "member" && (
              <p className="mt-3 text-sm text-warning">
                You are currently part of <strong>{currentGymName}</strong>. Joining {gymName} will move your membership.
              </p>
            )}
            {currentGymName && role === "member" && currentGymRole === "owner" && (
              <p className="mt-3 text-sm text-muted">
                You&apos;ll stay <strong>owner</strong> of <strong>{currentGymName}</strong>.
              </p>
            )}
            {currentGymName && role === "member" && currentGymRole === "staff" && (
              <p className="mt-3 text-sm text-muted">
                You&apos;ll stay <strong>staff</strong> of <strong>{currentGymName}</strong>.
              </p>
            )}
            {otherMemberGymName && role === "member" && (currentGymRole === "owner" || currentGymRole === "staff") && (
              <p className="mt-3 text-sm text-warning">
                Your member role at <strong>{otherMemberGymName}</strong> will be moved to {gymName}.
              </p>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-6 py-4">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.push("/today")}
          disabled={redeeming}
          className="flex-1 rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          {alreadyInAtSameOrHigher ? "Close" : "Cancel"}
        </button>
        {!alreadyInAtSameOrHigher && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={redeeming}
            className="flex-1 rounded-xl border border-accent bg-accent px-6 py-3 text-sm font-medium text-fg-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {redeeming ? "Joining..." : isMemberUpgradeToStaff ? "Join as staff" : "Confirm"}
          </button>
        )}
      </div>
    </div>
  );
}
