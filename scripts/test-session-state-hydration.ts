import { saveSessionState, loadSessionState, clearSessionState } from "@/lib/session/session-state-cache";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

class MockStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

function testLoadEmptyCache() {
  console.log("\n▶ Testing load from empty cache...");
  
  const storage = new MockStorage();
  const result = loadSessionState(storage as any, "user123", "session456", () => Date.now());
  
  assert(result === null, "Should return null for empty cache");
  console.log("  ✓ Empty cache returns null");
}

function testSaveAndLoadCache() {
  console.log("\n▶ Testing save and load cache...");
  
  const storage = new MockStorage();
  const exercises = [
    {
      id: "ex1",
      name: "Squat",
      sets: [
        { setNumber: 1, reps: 10, weightKg: 100, durationSeconds: null }
      ]
    }
  ];
  
  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveSessionState(storage as any, "user123", "session456", exercises, () => now);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = loadSessionState(storage as any, "user123", "session456", () => now);
  
  assert(result !== null, "Should load saved state");
  assert(result!.exercises.length === 1, "Should have 1 exercise");
  assert(result!.exercises[0].name === "Squat", "Should preserve exercise name");
  console.log("  ✓ Save and load cache preserves state");
}

function testStaleCache() {
  console.log("\n▶ Testing stale cache removal...");
  
  const storage = new MockStorage();
  const exercises = [
    {
      id: "ex1",
      name: "Squat",
      sets: []
    }
  ];
  
  const pastTime = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
  saveSessionState(storage as any, "user123", "session456", exercises, () => pastTime);
  const result = loadSessionState(storage as any, "user123", "session456", () => Date.now());
  
  assert(result === null, "Should return null for stale cache");
  console.log("  ✓ Stale cache removed");
}

function testUserIsolation() {
  console.log("\n▶ Testing user isolation...");
  
  const storage = new MockStorage();
  const exercises1 = [{ id: "ex1", name: "Squat", sets: [] }];
  const exercises2 = [{ id: "ex2", name: "Bench", sets: [] }];
  
  const now = Date.now();
  saveSessionState(storage as any, "user1", "session1", exercises1, () => now);
  saveSessionState(storage as any, "user2", "session1", exercises2, () => now);
  
  const result1 = loadSessionState(storage as any, "user1", "session1", () => now);
  const result2 = loadSessionState(storage as any, "user2", "session1", () => now);
  
  assert(result1!.exercises[0].name === "Squat", "User1 should get Squat");
  assert(result2!.exercises[0].name === "Bench", "User2 should get Bench");
  console.log("  ✓ Users have isolated cache");
}

function testClearCache() {
  console.log("\n▶ Testing clear cache...");
  
  const storage = new MockStorage();
  const exercises = [{ id: "ex1", name: "Squat", sets: [] }];
  
  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveSessionState(storage as any, "user123", "session456", exercises, () => now);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clearSessionState(storage as any, "user123", "session456");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = loadSessionState(storage as any, "user123", "session456", () => now);
  
  assert(result === null, "Should return null after clear");
  console.log("  ✓ Clear removes cache");
}

console.log("Testing Session State Cache Hydration");
console.log("====================================");

try {
  testLoadEmptyCache();
  testSaveAndLoadCache();
  testStaleCache();
  testUserIsolation();
  testClearCache();
  console.log("\n✅ All session state cache tests passed\n");
} catch (err: any) {
  console.error(`\n❌ Test error: ${err.message}\n`);
  process.exit(1);
}
