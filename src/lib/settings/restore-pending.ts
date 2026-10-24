import type { Database } from "@/lib/database.types";

type BodyRegion = Database["public"]["Enums"]["body_region"];
type InjurySeverity = Database["public"]["Enums"]["injury_severity"];

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
  type: string;
  patch: unknown;
  affectsPlan?: boolean;
  timestamp: number;
}

/**
 * Replay pending operations from stash.
 * 
 * Uses per-item actions (setEquipmentItem, setInjury) for new stash format,
 * falls back to whole-list actions (updateEquipment, updateInjuries) for legacy format.
 */
export async function replayPendingOps(
  changes: PendingChange[],
  actions: RestoreActions
): Promise<void> {
  for (const change of changes) {
    const { key, type, patch } = change;
    
    if (type === 'profile' && patch && typeof patch === 'object' && !Array.isArray(patch)) {
      await actions.updateProfileSettings(patch as Record<string, unknown>);
    } else if (type === 'session' && patch && typeof patch === 'object' && !Array.isArray(patch)) {
      await actions.updateSessionSettings(patch as Record<string, unknown>);
    } else if (type === 'equipment' && patch && typeof patch === 'object' && !Array.isArray(patch)) {
      // Per-item equipment restore (no whole-list overwrites)
      if ('operation' in patch) {
        if (patch.operation === 'setItem' && 'equipmentId' in patch && 'enabled' in patch) {
          const { equipmentId, enabled } = patch as { equipmentId: string; enabled: boolean };
          await actions.setEquipmentItem({ equipmentId, enabled });
        } else if (patch.operation === 'setHasAll' && 'hasAll' in patch) {
          const { hasAll } = patch as { hasAll: boolean };
          await actions.setHasAllEquipment(hasAll);
        }
      } else if ('hasAll' in patch && 'equipmentIds' in patch && actions.updateEquipment) {
        // Fallback: whole-list restore (legacy stash format from before per-item actions)
        const { hasAll, equipmentIds } = patch as { hasAll: boolean; equipmentIds: string[] };
        await actions.updateEquipment({ hasAll, equipmentIds });
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
          await actions.setInjury({ bodyRegion, present, severity });
        }
      } else if (Array.isArray(patch) && actions.updateInjuries) {
        // Fallback: whole-list restore (legacy stash format)
        await actions.updateInjuries(patch as { bodyRegion: BodyRegion; severity: InjurySeverity }[]);
      }
    }
  }
}
