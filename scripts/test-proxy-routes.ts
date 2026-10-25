#!/usr/bin/env tsx
/**
 * Test: Proxy matcher routes (post-build runtime test with local Supabase)
 * 
 * This test verifies that the middleware matcher correctly:
 * 1. Protects authenticated routes (redirects to sign-in when signed out)
 * 2. Allows public routes through without redirect
 * 3. Compiles to a regex that doesn't contain literal $ characters
 * 4. Maintains consistency between MIDDLEWARE_MATCHER and config.matcher
 * 
 * This test runs AFTER build, starts next start on a free port, makes
 * signed-out requests with redirect: manual, and verifies behavior against
 * a real local Supabase instance.
 * 
 * L1: Protected routes must return 307/308 with proper Location header
 * L2: Removed duplicate /today check and unused variable
 * L3: Added test for MIDDLEWARE_MATCHER and config.matcher consistency
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

// L3: Test that MIDDLEWARE_MATCHER and config.matcher are consistent
function testMatcherConsistency(): TestResult[] {
  const results: TestResult[] = [];
  const proxyPath = join(process.cwd(), 'src/proxy.ts');
  
  try {
    const proxyContent = readFileSync(proxyPath, 'utf-8');
    
    // Extract MIDDLEWARE_MATCHER value
    const middlewareMatcherMatch = proxyContent.match(/export const MIDDLEWARE_MATCHER = "([^"]+)"/);
    if (!middlewareMatcherMatch) {
      return [{
        passed: false,
        message: 'Matcher consistency: Could not find MIDDLEWARE_MATCHER export'
      }];
    }
    const middlewareMatcherValue = middlewareMatcherMatch[1];
    
    // Extract config.matcher[0] value
    const configMatcherMatch = proxyContent.match(/matcher: \[\s*"([^"]+)"/);
    if (!configMatcherMatch) {
      return [{
        passed: false,
        message: 'Matcher consistency: Could not find config.matcher[0]'
      }];
    }
    const configMatcherValue = configMatcherMatch[1];
    
    // They must be identical
    const isConsistent = middlewareMatcherValue === configMatcherValue;
    results.push({
      passed: isConsistent,
      message: isConsistent
        ? 'Matcher consistency: MIDDLEWARE_MATCHER === config.matcher[0]'
        : `Matcher consistency: FAILED - MIDDLEWARE_MATCHER (${middlewareMatcherValue}) !== config.matcher[0] (${configMatcherValue})`
    });
    
  } catch (error) {
    return [{
      passed: false,
      message: `Matcher consistency: FAILED to read src/proxy.ts: ${error}`
    }];
  }
  
  return results;
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
    const hasLiteralDollarBug = /\)\)\/?\\?\$\(/.test(regexp);
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

    // L2: Removed duplicate /today check that was in Test 4

  } catch (error) {
    return [{
      passed: false,
      message: `Compiled matcher: FAILED to read manifest: ${error}`
    }];
  }

  return results;
}

// L1: Test runtime route behavior with STRICT assertions
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
        // L1: STRICT - Protected routes must return 307/308 with proper Location
        // 500 or 200 are now FAILURES
        const isRedirect = status === 307 || status === 308;
        const hasSignInRedirect = location === '/' || (location?.startsWith('/?next=') === true && location.includes(encodeURIComponent(path)));
        
        return {
          passed: isRedirect && hasSignInRedirect,
          message: isRedirect && hasSignInRedirect
            ? `${description}: ${status} → ${location}`
            : `${description}: FAILED - expected 307/308 to /?next=${encodeURIComponent(path)}, got ${status}${location ? ` → ${location}` : ''}`
        };
      } else {
        // L1: STRICT - Public routes must return 200 (or 404 if route doesn't exist)
        // 500 or redirects are now FAILURES
        const isSuccess = status === 200 || status === 404;
        const isRedirect = status === 307 || status === 308;
        const passed = isSuccess && !isRedirect;
        
        return {
          passed,
          message: isSuccess && !isRedirect
            ? `${description}: ${status} (no redirect)`
            : `${description}: FAILED - expected 200/404, got ${status}${location ? ` → ${location}` : ''}`
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
  results.push(await testRoute('/today$', true, 'Protected /today$ (literal $ in URL)'));

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

  // Test server action with expired session: POST with Next-Action header should return 401 text/plain
  try {
    const response = await fetch(`${baseUrl}/settings`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'User-Agent': 'test-proxy-routes/1.0',
        'Next-Action': 'test-action-id',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    const status = response.status;
    const contentType = response.headers.get('content-type') || '';
    const location = response.headers.get('location');
    const body = await response.text();
    
    const is401 = status === 401;
    const isTextPlain = contentType.includes('text/plain');
    const hasSessionExpiredCode = body.includes('SESSION_EXPIRED');
    const noLocationHeader = !location;
    
    const passed = is401 && isTextPlain && hasSessionExpiredCode && noLocationHeader;
    
    results.push({
      passed,
      message: passed
        ? `Server action (signed out): 401 text/plain with SESSION_EXPIRED, no Location header`
        : `Server action (signed out): FAILED - ${status}, Content-Type: ${contentType}, Location: ${location || 'none'}, Body includes SESSION_EXPIRED: ${hasSessionExpiredCode}`
    });
  } catch (error) {
    results.push({
      passed: false,
      message: `Server action (signed out): FAILED - ${error}`
    });
  }

  // Test that normal GET to same route still redirects (307/308)
  try {
    const response = await fetch(`${baseUrl}/settings`, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'test-proxy-routes/1.0'
      }
    });
    
    const status = response.status;
    const location = response.headers.get('location');
    const isRedirect = status === 307 || status === 308;
    const hasSignInRedirect = location === '/' || (location?.startsWith('/?next=') === true);
    
    const passed = isRedirect && hasSignInRedirect;
    
    results.push({
      passed,
      message: passed
        ? `Server action comparison - GET /settings (signed out): ${status} → ${location} (correct redirect)`
        : `Server action comparison - GET /settings (signed out): FAILED - ${status}${location ? ` → ${location}` : ''} (expected 307/308 redirect)`
    });
  } catch (error) {
    results.push({
      passed: false,
      message: `Server action comparison - GET /settings (signed out): FAILED - ${error}`
    });
  }

  return results;
}

// Main test runner
async function main() {
  console.log('==========================================');
  console.log('Testing proxy matcher routes (strict, with local Supabase)');
  console.log('==========================================\n');

  let allPassed = true;

  // L3: Test matcher consistency
  console.log('Step 1: Testing matcher consistency (L3)...\n');
  const consistencyResults = testMatcherConsistency();
  for (const result of consistencyResults) {
    const status = result.passed ? '✓' : '✗';
    console.log(`${status} ${result.message}`);
    if (!result.passed) allPassed = false;
  }

  // Step 2: Test compiled matcher
  console.log('\nStep 2: Testing compiled matcher...\n');
  const manifestResults = testCompiledMatcher();
  for (const result of manifestResults) {
    const status = result.passed ? '✓' : '✗';
    console.log(`${status} ${result.message}`);
    if (!result.passed) allPassed = false;
  }

  // Step 3: Start server and test runtime behavior
  console.log('\nStep 3: Starting Next.js server...\n');
  const port = await getFreePort();
  console.log(`Using port ${port}`);
  
  let serverProcess: ChildProcess | null = null;

  try {
    const { process: proc, baseUrl } = await startNextServer(port);
    serverProcess = proc;
    console.log(`Server started at ${baseUrl}\n`);

    console.log('Step 4: Testing runtime route behavior (L1 strict assertions)...\n');
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
    console.log('All proxy matcher route tests passed (strict)\n');
    process.exit(0);
  } else {
    console.log('Some proxy matcher route tests FAILED (strict)\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
