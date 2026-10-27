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
  timezone: string;
}

export function InvitesList({ gymId, gymName, initialCodes, timezone }: InvitesListProps) {
  const [codes, setCodes] = useState<JoinCode[]>(initialCodes);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<GymRole>("member");
  const [expiryDays, setExpiryDays] = useState<string>("30");
  const [maxUses, setMaxUses] = useState<string>("");
  const [revokeSuccess, setRevokeSuccess] = useState<string | null>(null);

  const handleCreateCode = async () => {
    setCreating(true);
    setCreateError(null);
    
    const expiryNum = expiryDays ? parseInt(expiryDays) : 0;
    const maxUsesNum = maxUses ? parseInt(maxUses) : 0;
    
    if (expiryNum && expiryNum < 1) {
      setCreateError("Expiry must be at least 1 day");
      setCreating(false);
      return;
    }
    
    if (maxUsesNum && maxUsesNum < 1) {
      setCreateError("Max uses must be at least 1");
      setCreating(false);
      return;
    }
    
    const expiresAt = expiryNum > 0 ? new Date(Date.now() + expiryNum * 24 * 60 * 60 * 1000).toISOString() : undefined;
    const maxUsesValue = maxUsesNum > 0 ? maxUsesNum : undefined;
    
    const result = await createJoinCode(gymId, selectedRole, expiresAt, maxUsesValue);
    
    if (result.ok) {
      setCodes([result.code, ...codes]);
      setExpiryDays("30");
      setMaxUses("");
    } else {
      setCreateError(result.error);
    }
    
    setCreating(false);
  };

  const handleRevokeCode = async (codeId: string) => {
    setRevokeSuccess(null);
    const result = await revokeJoinCode(codeId);
    
    if (result.ok) {
      setCodes(codes.map(c => c.id === codeId ? { ...c, revoked_at: new Date().toISOString() } : c));
      setRevokeSuccess("Code revoked successfully");
      setTimeout(() => setRevokeSuccess(null), 3000);
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
        <div className="space-y-4 rounded-xl border border-border bg-surface-2 px-6 py-6">
          <div>
            <label htmlFor="role" className="block text-sm font-medium mb-2">
              Role
            </label>
            <select
              id="role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as GymRole)}
              className="w-full rounded-lg border border-border bg-surface-1 px-4 py-2 text-sm text-fg"
            >
              <option value="member">Member</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="expiry" className="block text-sm font-medium mb-2">
              Expires in (days)
            </label>
            <input
              id="expiry"
              type="number"
              min="1"
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              placeholder="30"
              className="w-full rounded-lg border border-border bg-surface-1 px-4 py-2 text-sm text-fg"
            />
            <p className="mt-1 text-xs text-muted">Default: 30 days. Leave empty for no expiry.</p>
          </div>
          
          <div>
            <label htmlFor="maxUses" className="block text-sm font-medium mb-2">
              Max uses
            </label>
            <input
              id="maxUses"
              type="number"
              min="1"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Unlimited"
              className="w-full rounded-lg border border-border bg-surface-1 px-4 py-2 text-sm text-fg"
            />
            <p className="mt-1 text-xs text-muted">Default: unlimited. Set a number to limit uses.</p>
          </div>
          
          <button
            type="button"
            onClick={handleCreateCode}
            disabled={creating}
            className="w-full rounded-xl border border-accent bg-accent px-6 py-3 text-sm font-medium text-fg-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Code"}
          </button>
        </div>
        {createError && (
          <p className="mt-2 text-sm text-danger">{createError}</p>
        )}
        {revokeSuccess && (
          <p className="mt-2 text-sm text-success">{revokeSuccess}</p>
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
              const expiryText = formatJoinCodeExpiry(code, timezone);
              
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
