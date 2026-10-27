"use client";

import { useState } from "react";
import type { Database } from "@/lib/database.types";
import { createJoinCode, revokeJoinCode } from "./actions";
import { formatJoinCodeExpiry, isJoinCodeActive } from "./code-helpers";

type JoinCode = Database["public"]["Tables"]["gym_join_codes"]["Row"];
type GymRole = Database["public"]["Enums"]["gym_role"];

interface InvitesListProps {
  gymId: string;
  gymName: string;
  initialCodes: JoinCode[];
}

export function InvitesList({ gymId, gymName, initialCodes }: InvitesListProps) {
  const [codes, setCodes] = useState<JoinCode[]>(initialCodes);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateCode = async (role: GymRole) => {
    setCreating(true);
    setCreateError(null);
    
    const result = await createJoinCode(gymId, role);
    
    if (result.ok) {
      setCodes([result.code, ...codes]);
    } else {
      setCreateError(result.error);
    }
    
    setCreating(false);
  };

  const handleRevokeCode = async (codeId: string) => {
    const result = await revokeJoinCode(codeId);
    
    if (result.ok) {
      setCodes(codes.map(c => c.id === codeId ? { ...c, revoked_at: new Date().toISOString() } : c));
    }
  };

  const handleCopyLink = async (code: string) => {
    const url = `${window.location.origin}/join/${code}`;
    await navigator.clipboard.writeText(url);
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-4">Create Invite Code</h2>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleCreateCode("member")}
            disabled={creating}
            className="flex-1 rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-fg transition-colors hover:bg-surface-3 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Member Code"}
          </button>
          <button
            type="button"
            onClick={() => handleCreateCode("staff")}
            disabled={creating}
            className="flex-1 rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-fg transition-colors hover:bg-surface-3 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Staff Code"}
          </button>
        </div>
        {createError && (
          <p className="mt-2 text-sm text-danger">{createError}</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Active Codes</h2>
        {codes.length === 0 ? (
          <p className="text-sm text-muted">No invite codes yet. Create one above.</p>
        ) : (
          <div className="space-y-3">
            {codes.map((code) => {
              const isActive = isJoinCodeActive(code);
              const expiryText = formatJoinCodeExpiry(code);
              
              return (
                <div
                  key={code.id}
                  className={`rounded-xl border ${isActive ? 'border-border bg-surface-2' : 'border-border/50 bg-surface-1 opacity-60'} px-6 py-4`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <code className="text-lg font-mono font-bold">{code.code}</code>
                        <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                          {code.role}
                        </span>
                        {!isActive && (
                          <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-medium text-danger">
                            {code.revoked_at ? "Revoked" : "Expired"}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-sm text-muted">
                        <div>Uses: {code.use_count}{code.max_uses ? ` / ${code.max_uses}` : " (unlimited)"}</div>
                        {expiryText && <div>{expiryText}</div>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {isActive && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleCopyLink(code.code)}
                            className="rounded-lg border border-border bg-surface-3 px-4 py-2 text-xs font-medium text-fg transition-colors hover:bg-surface-4"
                          >
                            Copy Link
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRevokeCode(code.id)}
                            className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-xs font-medium text-danger transition-colors hover:bg-danger/20"
                          >
                            Revoke
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
