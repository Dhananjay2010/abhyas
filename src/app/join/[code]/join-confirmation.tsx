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
  currentMemberGym: string | null;
}

export function JoinConfirmation({
  code,
  gymName,
  role,
  currentMemberGym,
}: JoinConfirmationProps) {
  const router = useRouter();
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setRedeeming(true);
    setError(null);

    const result = await redeemJoinCode(code);

    if (result.ok) {
      router.push("/today");
    } else {
      setError(result.error);
      setRedeeming(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface-2 px-6 py-8 text-center">
        <h1 className="text-2xl font-bold">Join {gymName}?</h1>
        <p className="mt-3 text-sm text-muted">
          You will join as a <strong>{role}</strong>
        </p>
        {currentMemberGym && role === "member" && (
          <p className="mt-3 text-sm text-warning">
            You are currently a member of <strong>{currentMemberGym}</strong>. Joining {gymName} will move your membership.
          </p>
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
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={redeeming}
          className="flex-1 rounded-xl border border-accent bg-accent px-6 py-3 text-sm font-medium text-fg-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {redeeming ? "Joining..." : "Confirm"}
        </button>
      </div>
    </div>
  );
}
