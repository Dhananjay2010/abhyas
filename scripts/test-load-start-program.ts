import { strict as assert } from "node:assert";
import { loadStartProgram, createSupabaseDeps } from "../src/lib/session/load-start-program";
import type { Database } from "../src/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

(async () => {
  console.log("✓ setup complete");

  let queryCalls: Array<{ select: string; filters: Array<{ field: string; value: string }> }> = [];

  const mockClient = {
    from: (table: string) => {
      let selectClause = "";
      const filters: Array<{ field: string; value: string }> = [];
      
      return {
        select: (clause: string) => {
          selectClause = clause;
          return {
            eq: (field: string, value: unknown) => {
              filters.push({ field, value: String(value) });
              return {
                eq: (field2: string, value2: unknown) => {
                  filters.push({ field: field2, value: String(value2) });
                  return {
                    maybeSingle: async () => {
                      queryCalls.push({ select: selectClause, filters });
                      
                      if (table === "programs") {
                        const hasStatusFilter = filters.some(f => f.field === "program_days.status" && f.value === "active");
                        
                        if (filters.some(f => f.field === "id" && f.value === "prog-1")) {
                          const programDays = hasStatusFilter 
                            ? [{ id: "day-1", day_index: 1, day_type: "weights", focus: "upper", label: "Upper Body" }]
                            : [
                                { id: "day-1", day_index: 1, day_type: "weights", focus: "upper", label: "Upper Body" },
                                { id: "day-superseded", day_index: 3, day_type: "weights", focus: "lower", label: "Lower Body" }
                              ];
                          
                          return {
                            data: {
                              id: "prog-1",
                              started_on: "2026-10-20",
                              deload_week: 4,
                              week_offset: 0,
                              program_days: programDays
                            }
                          };
                        }
                      }
                      return { data: null };
                    }
                  };
                },
                maybeSingle: async () => {
                  queryCalls.push({ select: selectClause, filters });
                  
                  if (table === "programs" && filters.some(f => f.field === "id" && f.value === "prog-1")) {
                    const hasStatusFilter = filters.some(f => f.field === "program_days.status" && f.value === "active");
                    const programDays = hasStatusFilter 
                      ? [{ id: "day-1", day_index: 1, day_type: "weights", focus: "upper", label: "Upper Body" }]
                      : [
                          { id: "day-1", day_index: 1, day_type: "weights", focus: "upper", label: "Upper Body" },
                          { id: "day-superseded", day_index: 3, day_type: "weights", focus: "lower", label: "Lower Body" }
                        ];
                    
                    return {
                      data: {
                        id: "prog-1",
                        started_on: "2026-10-20",
                        deload_week: 4,
                        week_offset: 0,
                        program_days: programDays
                      }
                    };
                  }
                  return { data: null };
                }
              };
            }
          };
        }
      };
    }
  };

  queryCalls = [];
  const result1 = await loadStartProgram(createSupabaseDeps(mockClient as unknown as SupabaseClient<Database>), "prog-1", 1);
  assert(result1.ok, "load should succeed for active day");
  assert.equal(result1.program.id, "prog-1");
  assert.equal(result1.dayId, "day-1");
  
  const lastQuery = queryCalls[queryCalls.length - 1];
  assert(lastQuery.filters.some(f => f.field === "program_days.status" && f.value === "active"), "status filter must be applied on program_days");
  console.log("✓ loads active day successfully");
  console.log("✓ program_days filtered by status='active'");

  queryCalls = [];
  const result2 = await loadStartProgram(createSupabaseDeps(mockClient as unknown as SupabaseClient<Database>), "prog-1", 3);
  assert(!result2.ok, "day index with superseded status should not be picked when filter is applied");
  assert.equal(result2.error, "No plan for today.");
  console.log("✓ superseded day is not picked");

  const mockClientWithSuperseded: unknown = {
    from: (table: string) => {
      const filters: Array<{ field: string; value: string }> = [];
      
      return {
        select: () => {
          return {
            eq: (field: string, value: unknown) => {
              filters.push({ field, value: String(value) });
              return {
                eq: (field2: string, value2: unknown) => {
                  filters.push({ field: field2, value: String(value2) });
                  return {
                    maybeSingle: async () => {
                      if (table === "programs" && filters.some(f => f.field === "id" && f.value === "prog-2")) {
                        const hasStatusFilter = filters.some(f => f.field === "program_days.status" && f.value === "active");
                        const programDays = hasStatusFilter
                          ? [{ id: "day-active-1", day_index: 1, day_type: "weights", focus: "upper", label: "Upper Active" }]
                          : [
                              { id: "day-superseded-1", day_index: 1, day_type: "weights", focus: "lower", label: "Lower Superseded" },
                              { id: "day-active-1", day_index: 1, day_type: "weights", focus: "upper", label: "Upper Active" }
                            ];
                        
                        return {
                          data: {
                            id: "prog-2",
                            started_on: "2026-10-20",
                            deload_week: 4,
                            week_offset: 0,
                            program_days: programDays
                          }
                        };
                      }
                      return { data: null };
                    }
                  };
                }
              };
            }
          };
        }
      };
    }
  };

  const result6 = await loadStartProgram(createSupabaseDeps(mockClientWithSuperseded as SupabaseClient<Database>), "prog-2", 1);
  assert(result6.ok, "should load when status filter returns only active day");
  assert.equal(result6.dayId, "day-active-1", "when filter is present, should get only active day");
  console.log("✓ picks active day when both active and superseded days exist for same index");

  queryCalls = [];
  const result3 = await loadStartProgram(createSupabaseDeps(mockClient as unknown as SupabaseClient<Database>), "prog-1", 7);
  assert(!result3.ok, "day index with no active day should fail");
  assert.equal(result3.error, "No plan for today.");
  console.log("✓ day with no active entry returns 'No plan for today.'");

  const mockClientEmpty = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null })
          })
        })
      })
    })
  };

  const result4 = await loadStartProgram(createSupabaseDeps(mockClientEmpty as unknown as SupabaseClient<Database>), "prog-missing", 1);
  assert(!result4.ok, "missing program should fail");
  assert.equal(result4.error, "No plan for today.");
  console.log("✓ missing program returns 'No plan for today.'");

  const mockClientEmptyDays = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "prog-empty",
                started_on: "2026-10-20",
                deload_week: 4,
                week_offset: 0,
                program_days: []
              }
            })
          })
        })
      })
    })
  };

  const result5 = await loadStartProgram(createSupabaseDeps(mockClientEmptyDays as unknown as SupabaseClient<Database>), "prog-empty", 1);
  assert(!result5.ok, "program with empty active days list should fail");
  assert.equal(result5.error, "No plan for today.");
  console.log("✓ program with empty active days list returns 'No plan for today.'");

  console.log("\nAll load-start-program tests passed.");
})();
