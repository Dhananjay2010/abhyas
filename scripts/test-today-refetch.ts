/**
 * Test Today page refetches on resume
 * 
 * Case C: Today must refetch when user returns (pageshow/visibilitychange/focus)
 * so stale Start/Resume button isn't shown after logging in another tab.
 */


let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`✗ ${message}`);
    failures++;
  } else {
    console.log(`✓ ${message}`);
  }
}

// Test 1: RefetchOnResume component exists
async function testRefetchComponentExists() {
  try {
    const { RefetchOnResume } = await import("../src/app/today/refetch-on-resume");
    assert(typeof RefetchOnResume === "function", "RefetchOnResume is a function component");
    // Note: Cannot test render in isolation because useRouter needs Next.js context
  } catch (e) {
    assert(false, `RefetchOnResume component should exist: ${e}`);
  }
}

// Test 2: Today page imports and renders RefetchOnResume
async function testTodayPageUsesRefetch() {
  try {
    // Check that today/page.tsx imports RefetchOnResume
    const fs = await import("fs");
    const pageSource = fs.readFileSync("src/app/today/page.tsx", "utf-8");
    
    assert(
      pageSource.includes('import { RefetchOnResume }'),
      "Today page imports RefetchOnResume"
    );
    
    assert(
      pageSource.includes('<RefetchOnResume />'),
      "Today page renders RefetchOnResume component"
    );
  } catch (e) {
    assert(false, `Today page should use RefetchOnResume: ${e}`);
  }
}

// Test 3: useResumeRefresh hook is used
async function testUseResumeRefreshImported() {
  try {
    const fs = await import("fs");
    const componentSource = fs.readFileSync("src/app/today/refetch-on-resume.tsx", "utf-8");
    
    assert(
      componentSource.includes('import { useResumeRefresh }'),
      "RefetchOnResume imports useResumeRefresh"
    );
    
    assert(
      componentSource.includes('useResumeRefresh()'),
      "RefetchOnResume calls useResumeRefresh"
    );
    
    assert(
      componentSource.includes('"use client"'),
      "RefetchOnResume is a client component"
    );
  } catch (e) {
    assert(false, `RefetchOnResume should use useResumeRefresh: ${e}`);
  }
}

async function main() {
  console.log("Testing Today page refetch on resume\n");
  
  await testRefetchComponentExists();
  await testTodayPageUsesRefetch();
  await testUseResumeRefreshImported();
  
  if (failures === 0) {
    console.log("\n✓ All Today refetch tests passed\n");
    process.exit(0);
  } else {
    console.error(`\n✗ ${failures} test(s) failed\n`);
    process.exit(1);
  }
}

main();
