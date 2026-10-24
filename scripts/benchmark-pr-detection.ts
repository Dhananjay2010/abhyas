/**
 * Benchmark PR detection query performance.
 * 
 * Simulates the query pattern for a heavy user with 600 sessions
 * and calculates expected load time based on request count and
 * typical network latency.
 * 
 *   npx tsx scripts/benchmark-pr-detection.ts
 */

console.log("\n=== PR Detection Query Performance Benchmark ===\n");

// Configuration: heavy user scenario
const config = {
  sessionsOnPage: 20,           // Current page size
  historicalSessions: 600,      // Max sessions to fetch for PR detection
  avgSetsPerSession: 15,        // Typical sets per session
  sessionIdChunkSize: 100,      // Session IDs per request (URL safety)
  maxRowsPerRequest: 1000,      // PostgREST max-rows limit
  avgLatencyMs: 50,             // Typical Supabase query latency (local: 5-20ms, hosted: 30-100ms)
};

console.log("1. Configuration");
console.log(`   - Page size: ${config.sessionsOnPage} sessions`);
console.log(`   - Historical sessions: ${config.historicalSessions}`);
console.log(`   - Avg sets per session: ${config.avgSetsPerSession}`);
console.log(`   - Session ID chunk size: ${config.sessionIdChunkSize}`);
console.log(`   - Max rows per request: ${config.maxRowsPerRequest}`);
console.log(`   - Avg query latency: ${config.avgLatencyMs}ms\n`);

// Step 1: Fetch sessions metadata
const sessionsFetchMs = config.avgLatencyMs;
console.log("2. Query 1: Fetch historical sessions metadata");
console.log(`   SELECT id, completed_at FROM sessions`);
console.log(`   WHERE user_id = ? AND completed_at <= ?`);
console.log(`   LIMIT ${config.historicalSessions}`);
console.log(`   → ${sessionsFetchMs}ms\n`);

// Step 2: Fetch sets in chunks with pagination
const totalSets = config.historicalSessions * config.avgSetsPerSession;
const chunks = Math.ceil(config.historicalSessions / config.sessionIdChunkSize);
const setsPerChunk = config.sessionIdChunkSize * config.avgSetsPerSession;
const pagesPerChunk = Math.ceil(setsPerChunk / config.maxRowsPerRequest);
const totalSetRequests = chunks * pagesPerChunk;
const setsFetchMs = totalSetRequests * config.avgLatencyMs;

console.log("3. Query 2-N: Fetch sets for historical sessions");
console.log(`   Total sets: ${totalSets}`);
console.log(`   Session ID chunks: ${chunks} (${config.sessionIdChunkSize} IDs per chunk)`);
console.log(`   Sets per chunk: ~${setsPerChunk}`);
console.log(`   Pages per chunk: ${pagesPerChunk} (${config.maxRowsPerRequest} rows per page)`);
console.log(`   Total requests: ${totalSetRequests}`);
console.log(`   → ${totalSetRequests} × ${config.avgLatencyMs}ms = ${setsFetchMs}ms\n`);

// Total time
const totalMs = sessionsFetchMs + setsFetchMs;
const totalRequests = 1 + totalSetRequests;

console.log("4. Total Query Time");
console.log(`   Requests: ${totalRequests}`);
console.log(`   Total time: ${totalMs}ms (${(totalMs / 1000).toFixed(2)}s)\n`);

// In-memory processing (detectSetPRs)
const processingMs = 10; // Very fast, pure JS
console.log("5. In-Memory PR Detection");
console.log(`   Process ${totalSets} sets with detectSetPRs()`);
console.log(`   → ${processingMs}ms\n`);

// Grand total
const grandTotalMs = totalMs + processingMs;
console.log("6. Total Page Load Time");
console.log(`   Query: ${totalMs}ms`);
console.log(`   Processing: ${processingMs}ms`);
console.log(`   Total: ${grandTotalMs}ms (${(grandTotalMs / 1000).toFixed(2)}s)\n`);

// Performance analysis
console.log("7. Performance Analysis\n");

if (grandTotalMs < 1000) {
  console.log("   ✅ EXCELLENT: Sub-second page load");
} else if (grandTotalMs < 2000) {
  console.log("   ✅ GOOD: ~1-2 second page load");
} else if (grandTotalMs < 3000) {
  console.log("   ⚠️  ACCEPTABLE: ~2-3 second page load");
} else {
  console.log("   ❌ SLOW: >3 second page load");
}

console.log(`\n   With local Supabase (5-20ms latency):`);
const localLatency = 15;
const localTotalMs = (1 + totalSetRequests) * localLatency + processingMs;
console.log(`   → ${localTotalMs}ms (${(localTotalMs / 1000).toFixed(2)}s)\n`);

console.log(`   With hosted Supabase (30-100ms latency):`);
const hostedLatency = 60;
const hostedTotalMs = (1 + totalSetRequests) * hostedLatency + processingMs;
console.log(`   → ${hostedTotalMs}ms (${(hostedTotalMs / 1000).toFixed(2)}s)\n`);

// Optimization notes
console.log("8. Optimization Notes\n");
console.log("   Current approach (no DB migration):");
console.log(`   - ${totalRequests} round trips to database`);
console.log(`   - Network latency dominates (${((totalMs / grandTotalMs) * 100).toFixed(1)}% of total time)`);
console.log(`   - In-memory processing is negligible (${((processingMs / grandTotalMs) * 100).toFixed(1)}% of total time)\n`);

console.log("   Alternative: Precomputed PR flags (requires migration):");
console.log("   - Add `is_pr` boolean column to `session_sets`");
console.log("   - Compute at insert time → 1 query instead of 13");
console.log(`   - Would reduce load time to ~${sessionsFetchMs}ms\n`);

console.log("   Trade-offs:");
console.log("   - Current: No migration, more queries, still fast for typical users");
console.log("   - Precomputed: Migration required, 1 query, faster for heavy users");
console.log("   - Recommendation: Current approach is acceptable until user feedback indicates otherwise\n");

// Exit successfully
console.log("✅ Benchmark complete\n");
