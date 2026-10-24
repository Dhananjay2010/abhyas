import { strict as assert } from "node:assert";
import { loadPlanDay, createSupabaseDeps } from "../src/lib/session/load-plan-day";

(async () => {
  console.log("✓ setup complete");

  let queryCalls: Array<{ select: string; filters: Array<{ field: string; value: string }> }> = [];

  const mockClient: { from: (table: string) => { select: (...args: unknown[]) => unknown } } = {
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
                      
                      if (table === "program_days") {
                        const hasStatusFilter = filters.some(f => f.field === "status" && f.value === "active");
                        assert(hasStatusFilter, "status='active' filter is required for program_days queries");
                        
                        if (filters.some(f => f.field === "id" && f.value === "day-active") && hasStatusFilter) {
                          return {
                            data: {
                              id: "day-active",
                              day_type: "weights"
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
                  assert.fail("Missing status='active' filter - called maybeSingle without chaining .eq('status', 'active')");
                }
              };
            }
          };
        }
      };
    }
  };

  queryCalls = [];
  const result1 = await loadPlanDay(createSupabaseDeps(mockClient), "day-active");
  assert(result1.ok, "load should succeed for active day");
  assert.equal(result1.day.id, "day-active");
  assert.equal(result1.day.day_type, "weights");
  
  const lastQuery = queryCalls[queryCalls.length - 1];
  assert(lastQuery.filters.some(f => f.field === "status" && f.value === "active"), "status filter must be applied");
  console.log("✓ loads active day successfully");
  console.log("✓ day filtered by status='active'");

  queryCalls = [];
  const result2 = await loadPlanDay(createSupabaseDeps(mockClient), "day-superseded");
  assert(!result2.ok, "superseded day should not be loaded");
  assert.equal(result2.error, "That day is not in your block.");
  console.log("✓ superseded day returns 'That day is not in your block.'");

  queryCalls = [];
  const result3 = await loadPlanDay(createSupabaseDeps(mockClient), "day-inactive");
  assert(!result3.ok, "inactive day should not be loaded");
  assert.equal(result3.error, "That day is not in your block.");
  console.log("✓ inactive day returns 'That day is not in your block.'");

  queryCalls = [];
  const result4 = await loadPlanDay(createSupabaseDeps(mockClient), "day-missing");
  assert(!result4.ok, "missing day should fail");
  assert.equal(result4.error, "That day is not in your block.");
  console.log("✓ missing day returns 'That day is not in your block.'");

  console.log("\nAll load-plan-day tests passed.");
})();
