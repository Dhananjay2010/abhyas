/**
 * Test: swap-prefill deload with equipmentIds
 * 
 * Verifies that resolveSwapPrefill correctly passes equipmentIds to suggestedWeight
 * for barbell exercises, ensuring deload weights snap to equipment grid.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSwapPrefill } from "./swap-prefill";
import * as progression from "@/lib/program/progression";

// Mock the database calls
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
  })),
} as any;

describe("swap-prefill deload equipmentIds", () => {
  let suggestedWeightSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Spy on suggestedWeight to verify it's called with correct equipmentIds
    suggestedWeightSpy = vi.spyOn(progression, "suggestedWeight");
  });

  it("MED-1: passes equipmentIds for barbell deload (not undefined)", async () => {
    // Set up a barbell exercise with progress
    const mockProgressData = {
      current_working_weight_kg: 20,
      current_target_reps: 12,
      consecutive_failures: 0,
    };

    mockSupabase.from = vi.fn((table: string) => {
      if (table === "exercise_progress") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: mockProgressData, error: null })
              ),
            })),
          })),
        };
      }
      // getLastPerformance call
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      };
    });

    // Call resolveSwapPrefill with barbell (not bodyweight)
    await resolveSwapPrefill(
      mockSupabase,
      "test-user",
      "test-exercise",
      true, // isDeload
      ["barbell"],
      "isolation",
      "reps",
      "biceps",
      undefined,
      true
    );

    // Verify suggestedWeight was called with equipmentIds = ["barbell"], not undefined
    expect(suggestedWeightSpy).toHaveBeenCalledWith(
      { currentWorkingWeightKg: 20 },
      true, // isDeload
      expect.objectContaining({
        mechanic: "isolation",
        movementPattern: "biceps",
        metric: "reps",
        isBodyweight: false,
      }),
      ["barbell"] // CRITICAL: must pass equipmentIds, not undefined
    );
  });

  it("MED-1: passes undefined for bodyweight deload", async () => {
    const mockProgressData = {
      current_working_weight_kg: 10,
      current_target_reps: 12,
      consecutive_failures: 0,
    };

    mockSupabase.from = vi.fn((table: string) => {
      if (table === "exercise_progress") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: mockProgressData, error: null })
              ),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      };
    });

    await resolveSwapPrefill(
      mockSupabase,
      "test-user",
      "test-exercise",
      true, // isDeload
      [], // bodyweight (no equipment)
      null,
      "reps",
      "other",
      undefined,
      true
    );

    // For bodyweight, equipmentIds should be undefined
    expect(suggestedWeightSpy).toHaveBeenCalledWith(
      { currentWorkingWeightKg: 10 },
      true,
      expect.objectContaining({
        isBodyweight: true,
      }),
      undefined // Bodyweight gets undefined
    );
  });
});
