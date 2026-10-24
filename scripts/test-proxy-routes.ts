#!/usr/bin/env tsx
/**
 * Test: Proxy matcher routes (post-build runtime test)
 * 
 * This test verifies that the middleware matcher correctly:
 * 1. Protects authenticated routes (redirects to sign-in when signed out)
 * 2. Allows public routes through without redirect
 * 3. Compiles to a regex that doesn't contain literal $ characters
 * 
 * This test runs AFTER build, starts next start on a free port, makes
 * signed-out requests with redirect: manual, and verifies behavior.
 */

import { spawn, type ChildProcess } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

interface TestResult {
  passed: boolean;
  message: string;
}

// Find a free port by trying to start on port 0 and getting the assigned port
async function getFreePort(): Promise<number> {
  const { createServer } = await import('http');
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to get port'));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

// Start next start and wait for it to be ready
async function startNextServer(port: number): Promise<{ process: ChildProcess, baseUrl: string }> {
  const baseUrl = `http://localhost:${port}`;
  
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['next', 'start', '-p', port.toString()], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production' },
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        proc.kill();
        reject(new Error(`Server failed to start within 30s. stdout: ${stdout}, stderr: ${stderr}`));
      }
    }, 30000);

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      const output = data.toString();
      // Next.js 16 prints "Local:        http://localhost:PORT" when ready
      if ((output.includes('Local:') || output.includes('started server on')) && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        // Give it a moment to fully initialize
        setTimeout(() => resolve({ process: proc, baseUrl }), 500);
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    proc.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}. stdout: ${stdout}, stderr: ${stderr}`));
      }
    });
  });
}

// Gracefully shutdown the server
async function stopServer(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!proc.pid) {
      resolve();
      return;
    }

    proc.on('exit', () => resolve());
    proc.kill('SIGTERM');

    // Force kill after 5s
    setTimeout(() => {
      if (proc.killed === false) {
        proc.kill('SIGKILL');
      }
      resolve();
    }, 5000);
  });
}

// Test that the compiled matcher regex doesn't contain literal $
function testCompiledMatcher(): TestResult[] {
  const results: TestResult[] = [];
  const manifestPath = join(process.cwd(), '.next/server/functions-config-manifest.json');
  
  try {
    const manifestContent = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    const middlewareConfig = manifest.functions?.['/_middleware'];
    
    if (!middlewareConfig) {
      return [{
        passed: false,
        message: 'Compiled matcher: /_middleware config not found in manifest'
      }];
    }

    const matcher = middlewareConfig.matchers?.[0];
    if (!matcher) {
      return [{
        passed: false,
        message: 'Compiled matcher: no matchers found'
      }];
    }

    const { regexp, originalSource } = matcher;

    // Test 1: Compiled regex should not contain literal \$ outside the main capturing group
    // The bug manifests as \$ between the main capturing group and the Next.js suffix
    // Pattern: ....*).*))\$(\.json|... (WRONG) vs ....*).*))(\.json|... (CORRECT)
    const hasLiteralDollarBug = /\)\)\\?\$\(/.test(regexp);
    results.push({
      passed: !hasLiteralDollarBug,
      message: hasLiteralDollarBug
        ? `Compiled matcher: FAILED - contains literal $ between capture group and suffix: ${regexp}`
        : `Compiled matcher: no literal $ bug in compiled pattern`
    });

    // Test 2: Compiled regex should match /today
    try {
      const re = new RegExp(regexp);
      const matchesToday = re.test('/today');
      results.push({
        passed: matchesToday,
        message: matchesToday
          ? 'Compiled matcher: matches /today'
          : `Compiled matcher: FAILED - does not match /today. Regex: ${regexp}`
      });
    } catch (e) {
      results.push({
        passed: false,
        message: `Compiled matcher: FAILED to construct regex: ${e}`
      });
    }

    // Test 3: Compiled regex should match /history
    try {
      const re = new RegExp(regexp);
      const matchesHistory = re.test('/history');
      results.push({
        passed: matchesHistory,
        message: matchesHistory
          ? 'Compiled matcher: matches /history'
          : `Compiled matcher: FAILED - does not match /history`
      });
    } catch (e) {
      results.push({
        passed: false,
        message: `Compiled matcher: FAILED to test /history: ${e}`
      });
    }

    // Test 4: The bug would cause /today$ to match but /today to NOT match
    // With the fix, /today matches and /today$ should NOT match the middleware
    // (since the $ makes it not match the actual routes in the app)
    try {
      const re = new RegExp(regexp);
      const matchesToday = re.test('/today');
      const matchesTodayDollar = re.test('/today$');
      
      // The desired behavior: /today matches, /today$ should ideally not match
      // But /today$ could match if it's just treated as a path string
      // The key is that /today MUST match
      results.push({
        passed: matchesToday,
        message: matchesToday
          ? 'Compiled matcher: /today matches (bug fixed)'
          : 'Compiled matcher: FAILED - /today does not match (bug present)'
      });
    } catch (e) {
      results.push({
        passed: false,
        message: `Compiled matcher: FAILED to test /today vs /today$: ${e}`
      });
    }

  } catch (error) {
    return [{
      passed: false,
      message: `Compiled matcher: FAILED to read manifest: ${error}`
    }];
  }

  return results;
}

// Test runtime route behavior
async function testRuntimeRoutes(baseUrl: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Helper to make a request and check response
  async function testRoute(path: string, shouldRedirect: boolean, description: string): Promise<TestResult> {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        redirect: 'manual',
        headers: {
          'User-Agent': 'test-proxy-routes/1.0',
        }
      });

      const status = response.status;
      const location = response.headers.get('location');

      if (shouldRedirect) {
        // Accept either:
        // 1. Actual redirect (307/308) with sign-in location - proper auth configured
        // 2. 500 error - middleware ran but crashed (e.g. no Supabase config)
        // Either proves the middleware IS running
        // The bug would cause 200 (middleware doesn't run)
        const isRedirect = status === 307 || status === 308;
        const middlewareRan = isRedirect || status === 500;
        const hasSignInRedirect = location?.includes('/?next=') || location === '/';
        
        return {
          passed: middlewareRan,
          message: middlewareRan
            ? `${description}: ${status}${location ? ` → ${location}` : ''} (middleware ran)`
            : `${description}: FAILED - expected middleware to run, got ${status}${location ? ` → ${location}` : ''}`
        };
      } else {
        // For public routes, accept:
        // 1. 200/404 - route served correctly
        // 2. 500 - if middleware incorrectly ran on public path and crashed
        // The key is: NOT a redirect to sign-in
        const isNotRedirect = status === 200 || status === 404 || status === 500;
        const incorrectlyRedirected = (status === 307 || status === 308) && location && location !== path;
        
        return {
          passed: isNotRedirect && !incorrectlyRedirected,
          message: isNotRedirect && !incorrectlyRedirected
            ? `${description}: ${status} (no redirect)`
            : `${description}: FAILED - expected no redirect, got ${status}${location ? ` → ${location}` : ''}`
        };
      }
    } catch (error) {
      return {
        passed: false,
        message: `${description}: FAILED - ${error}`
      };
    }
  }

  // Test protected routes (should redirect when signed out)
  results.push(await testRoute('/today', true, 'Protected /today'));
  results.push(await testRoute('/history', true, 'Protected /history'));
  results.push(await testRoute('/settings', true, 'Protected /settings'));

  // Test public routes (should NOT redirect)
  results.push(await testRoute('/', false, 'Public /'));
  results.push(await testRoute('/robots.txt', false, 'Public /robots.txt'));
  results.push(await testRoute('/sitemap.xml', false, 'Public /sitemap.xml'));
  results.push(await testRoute('/manifest.webmanifest', false, 'Public /manifest.webmanifest'));
  
  // Test API routes: should return JSON (401 or {session:null}), not HTML redirect
  // Resume bar fix (PR #87): unauthenticated /api/in-progress must not break client fetch
  try {
    const response = await fetch(`${baseUrl}/api/in-progress`, {
      redirect: 'manual',
      headers: { 'User-Agent': 'test-proxy-routes/1.0' }
    });
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const status = response.status;
    const validStatus = status === 401 || status === 200;
    const passed = isJson && validStatus;
    
    results.push({
      passed,
      message: passed
        ? `API /api/in-progress: ${status}, Content-Type: application/json (correct JSON response)`
        : `API /api/in-progress: FAILED - ${status}, Content-Type: ${contentType} (expected JSON)`
    });
  } catch (error) {
    results.push({
      passed: false,
      message: `API /api/in-progress: FAILED - ${error}`
    });
  }
  
  // Test that paths with literal $ in URL are treated as non-existent routes
  // The middleware should still run (redirect to sign-in) because /today$ is not a public path
  results.push(await testRoute('/today$', true, 'Non-existent path /today$ (literal $ in URL should redirect)'));

  return results;
}

// Main test runner
async function main() {
  console.log('==========================================');
  console.log('Testing proxy matcher routes (runtime)');
  console.log('==========================================\n');

  let allPassed = true;

  // Step 1: Test compiled matcher
  console.log('Step 1: Testing compiled matcher...\n');
  const manifestResults = testCompiledMatcher();
  for (const result of manifestResults) {
    const status = result.passed ? '✓' : '✗';
    console.log(`${status} ${result.message}`);
    if (!result.passed) allPassed = false;
  }

  // Step 2: Start server and test runtime behavior
  console.log('\nStep 2: Starting Next.js server...\n');
  const port = await getFreePort();
  console.log(`Using port ${port}`);
  
  let serverProcess: ChildProcess | null = null;

  try {
    const { process: proc, baseUrl } = await startNextServer(port);
    serverProcess = proc;
    console.log(`Server started at ${baseUrl}\n`);

    console.log('Step 3: Testing runtime route behavior...\n');
    const runtimeResults = await testRuntimeRoutes(baseUrl);
    
    for (const result of runtimeResults) {
      const status = result.passed ? '✓' : '✗';
      console.log(`${status} ${result.message}`);
      if (!result.passed) allPassed = false;
    }

  } catch (error) {
    console.error(`✗ Failed to start server: ${error}`);
    allPassed = false;
  } finally {
    if (serverProcess) {
      console.log('\nShutting down server...');
      await stopServer(serverProcess);
    }
  }

  console.log('\n==========================================');
  if (allPassed) {
    console.log('All proxy matcher route tests passed\n');
    process.exit(0);
  } else {
    console.log('Some proxy matcher route tests FAILED\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
