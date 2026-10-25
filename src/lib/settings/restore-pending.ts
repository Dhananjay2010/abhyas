import type { Database } from "@/lib/database.types";

type BodyRegion = Database["public"]["Enums"]["body_region"];
type InjurySeverity = Database["public"]["Enums"]["injury_severity"];

/**
 * Typed union for all pending operation types.
 * Used consistently across writer (settings-form.tsx) and reader (replayPendingOps).
 */
export type PendingOpType = 'profile' | 'session' | 'equipment' | 'injury';

/**
 * Actions interface for restoring pending changes.
 * In production, bind to real server actions.
 * In tests, bind to core functions with test client.
 */
export interface RestoreActions {
  updateProfileSettings: (patch: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  updateSessionSettings: (patch: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  setEquipmentItem: (input: { equipmentId: string; enabled: boolean }) => Promise<{ ok: boolean; error?: string }>;
  setHasAllEquipment: (hasAll: boolean) => Promise<{ ok: boolean; error?: string }>;
  setInjury: (input: { bodyRegion: BodyRegion; present: boolean; severity?: InjurySeverity }) => Promise<{ ok: boolean; error?: string }>;
  updateEquipment?: (input: { hasAll: boolean; equipmentIds: string[] }) => Promise<{ ok: boolean; error?: string }>;
  updateInjuries?: (injuries: { bodyRegion: BodyRegion; severity: InjurySeverity }[]) => Promise<{ ok: boolean; error?: string }>;
}

export interface PendingChange {
  key: string;
  type: PendingOpType;
  patch: unknown;
  affectsPlan?: boolean;
  timestamp: number;
}

/**
 * Replay pending operations from stash.
 * 
 * Uses per-item actions (setEquipmentItem, setInjury) for new stash format,
 * falls back to whole-list actions (updateEquipment, updateInjuries) for legacy format.
 * 
 * Throws if any operation fails with SESSION_EXPIRED (either as a result code or thrown error).
 * Returns the count of operations that were successfully handled. Caller must ensure all ops
 * are handled before clearing the stash.
 */
export async function replayPendingOps(
  changes: PendingChange[],
  actions: RestoreActions
): Promise<{ handledCount: number; unrecognizedOps: string[] }> {
  let handledCount = 0;
  const unrecognizedOps: string[] = [];

  // Helper to check if a result indicates session expiration
  function checkSessionExpired(result: unknown): boolean {
    if (!result || typeof result !== 'object') return false;
    if ('code' in result && result.code === 'SESSION_EXPIRED') return true;
    if ('error' in result && typeof result.error === 'string' && result.error.includes('SESSION_EXPIRED')) return true;
    return false;
  }

  for (const change of changes) {
    const { type, patch } = change;
    let handled = false;
    
    if (type === 'profile' && patch && typeof patch === 'object' && !Array.isArray(patch)) {
      const result = await actions.updateProfileSettings(patch as Record<string, unknown>);
      if (checkSessionExpired(result)) {
        throw new Error('SESSION_EXPIRED: Session expired during restore');
      }
      handled = true;
    } else if (type === 'session' && patch && typeof patch === 'object' && !Array.isArray(patch)) {
      const result = await actions.updateSessionSettings(patch as Record<string, unknown>);
      if (checkSessionExpired(result)) {
        throw new Error('SESSION_EXPIRED: Session expired during restore');
      }
      handled = true;
    } else if (type === 'equipment' && patch && typeof patch === 'object' && !Array.isArray(patch)) {
      // Per-item equipment restore (no whole-list overwrites)
      if ('operation' in patch) {
        if (patch.operation === 'setItem' && 'equipmentId' in patch && 'enabled' in patch) {
          const { equipmentId, enabled } = patch as { equipmentId: string; enabled: boolean };
          const result = await actions.setEquipmentItem({ equipmentId, enabled });
          if (checkSessionExpired(result)) {
            throw new Error('SESSION_EXPIRED: Session expired during restore');
          }
          handled = true;
        } else if (patch.operation === 'setHasAll' && 'hasAll' in patch) {
          const { hasAll } = patch as { hasAll: boolean };
          const result = await actions.setHasAllEquipment(hasAll);
          if (checkSessionExpired(result)) {
            throw new Error('SESSION_EXPIRED: Session expired during restore');
          }
          handled = true;
        }
      } else if ('hasAll' in patch && 'equipmentIds' in patch && actions.updateEquipment) {
        // Fallback: whole-list restore (legacy stash format from before per-item actions)
        const { hasAll, equipmentIds } = patch as { hasAll: boolean; equipmentIds: string[] };
        const result = await actions.updateEquipment({ hasAll, equipmentIds });
        if (checkSessionExpired(result)) {
          throw new Error('SESSION_EXPIRED: Session expired during restore');
        }
        handled = true;
      }
    } else if (type === 'injury' && patch && typeof patch === 'object' && !Array.isArray(patch)) {
      // Per-item injury restore
      if ('operation' in patch && patch.operation === 'setInjury') {
        if ('bodyRegion' in patch && 'present' in patch) {
          const { bodyRegion, present, severity } = patch as {
            bodyRegion: BodyRegion;
            present: boolean;
            severity?: InjurySeverity;
          };
          const result = await actions.setInjury({ bodyRegion, present, severity });
          if (checkSessionExpired(result)) {
            throw new Error('SESSION_EXPIRED: Session expired during restore');
          }
          handled = true;
        }
      } else if (Array.isArray(patch) && actions.updateInjuries) {
        // Fallback: whole-list restore (legacy stash format)
        const result = await actions.updateInjuries(patch as { bodyRegion: BodyRegion; severity: InjurySeverity }[]);
        if (checkSessionExpired(result)) {
          throw new Error('SESSION_EXPIRED: Session expired during restore');
        }
        handled = true;
      }
    }

    if (handled) {
      handledCount++;
    } else {
      unrecognizedOps.push(`${type}:${change.key}`);
    }
  }

  return { handledCount, unrecognizedOps };
}
