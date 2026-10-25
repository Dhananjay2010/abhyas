import { readFileSync } from 'fs';
import { join } from 'path';
import semver from 'semver';

/**
 * Validates that engines.node and .nvmrc meet project requirements.
 * 
 * Requirements:
 * - engines.node must be a valid semver range
 * - engines.node must be a subset of '>=22.13.0 <23' (no versions outside this range allowed)
 * - .nvmrc must be a valid version that satisfies engines.node
 * 
 * @returns Array of error messages, empty if valid
 */
export function validateEngines(
  enginesNode: string,
  nvmrc: string
): string[] {
  const errors: string[] = [];
  
  // Validate engines.node is a valid range
  if (!semver.validRange(enginesNode)) {
    errors.push(`engines.node is not a valid semver range: "${enginesNode}"`);
    return errors; // Can't proceed with invalid range
  }
  
  // Check if engines.node is a subset of the required range
  const requiredRange = '>=22.13.0 <23';
  
  // Special case: reject empty or wildcard ranges
  if (enginesNode.trim() === '' || enginesNode.trim() === '*') {
    errors.push(`engines.node cannot be empty or wildcard, must restrict to ${requiredRange}`);
    return errors;
  }
  
  // Use subset to ensure engines.node doesn't allow any versions outside our required range
  if (!semver.subset(enginesNode, requiredRange)) {
    errors.push(`engines.node "${enginesNode}" is not a subset of required range ${requiredRange}`);
  }
  
  // Validate .nvmrc can be coerced to a version
  const nvmrcVersion = semver.coerce(nvmrc);
  if (!nvmrcVersion) {
    errors.push(`Failed to parse .nvmrc version: "${nvmrc}"`);
    return errors;
  }
  
  // Check if coerced .nvmrc meets minimum requirement
  if (semver.lt(nvmrcVersion, '22.13.0')) {
    errors.push(
      `.nvmrc "${nvmrc}" coerces to ${nvmrcVersion.version} which is below minimum 22.13.0`
    );
  }
  
  // Check if .nvmrc satisfies engines.node
  if (!semver.satisfies(nvmrcVersion, enginesNode)) {
    errors.push(
      `.nvmrc "${nvmrc}" (${nvmrcVersion.version}) does not satisfy engines.node "${enginesNode}"`
    );
  }
  
  return errors;
}

// Main execution
if (require.main === module) {
  console.log('Testing Node version requirements...');
  
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
  const nvmrc = readFileSync(join(process.cwd(), '.nvmrc'), 'utf-8').trim();
  const enginesNode = pkg.engines?.node;
  
  if (!enginesNode) {
    console.error('✗ package.json missing engines.node field');
    process.exit(1);
  }
  
  console.log(`  .nvmrc: ${nvmrc}`);
  console.log(`  engines.node: ${enginesNode}`);
  console.log(`  current Node: ${process.version}`);
  
  // Validate engines and .nvmrc
  const errors = validateEngines(enginesNode, nvmrc);
  
  if (errors.length > 0) {
    console.error('\n✗ Validation failed:');
    errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }
  
  // Validate current Node satisfies engines.node (with prerelease support)
  const currentVersion = semver.parse(process.version);
  if (!currentVersion) {
    console.error(`✗ Failed to parse current Node version: ${process.version}`);
    process.exit(1);
  }
  
  // For prerelease versions, we need includePrerelease option
  const satisfiesEngines = semver.satisfies(
    process.version,
    enginesNode,
    { includePrerelease: true }
  );
  
  if (!satisfiesEngines) {
    console.error(
      `✗ Current Node version ${process.version} does not satisfy engines.node: ${enginesNode}`
    );
    process.exit(1);
  }
  
  console.log('\n✓ Node version requirements validated');
  console.log('  - engines.node is a subset of >=22.13.0 <23');
  console.log('  - .nvmrc satisfies engines.node');
  console.log('  - Current Node satisfies engines.node');
  
  // Comprehensive table tests
  console.log('\n=== Table Tests ===\n');
  
  interface TestCase {
    description: string;
    enginesNode: string;
    nvmrc: string;
    shouldPass: boolean;
    expectedErrors?: string[];
  }
  
  const testCases: TestCase[] = [
    // Accept cases
    {
      description: 'Valid range >=22.13.0 <23',
      enginesNode: '>=22.13.0 <23',
      nvmrc: '22.14.0',
      shouldPass: true
    },
    {
      description: 'Valid range with space after operator',
      enginesNode: '>= 22.13.0 <23',
      nvmrc: '22.14.0',
      shouldPass: true
    },
    {
      description: 'Caret range ^22.13.0',
      enginesNode: '^22.13.0',
      nvmrc: '22.14.0',
      shouldPass: true
    },
    {
      description: '.nvmrc with v prefix',
      enginesNode: '>=22.13.0 <23',
      nvmrc: 'v22.14.0',
      shouldPass: true
    },
    
    // Reject cases - engines.node issues
    {
      description: 'Only upper bound <=23.0.0 (no minimum)',
      enginesNode: '<=23.0.0',
      nvmrc: '22.14.0',
      shouldPass: false
    },
    {
      description: 'OR range allowing 24.x',
      enginesNode: '>=22.13.0 <23 || >=24',
      nvmrc: '22.14.0',
      shouldPass: false
    },
    {
      description: 'Contradictory range',
      enginesNode: '>=23.0.0 <22.0.0',
      nvmrc: '22.14.0',
      shouldPass: false
    },
    {
      description: 'Empty engines.node',
      enginesNode: '',
      nvmrc: '22.14.0',
      shouldPass: false
    },
    {
      description: 'Wildcard engines.node',
      enginesNode: '*',
      nvmrc: '22.14.0',
      shouldPass: false
    },
    {
      description: 'No upper bound >=22',
      enginesNode: '>=22',
      nvmrc: '22.14.0',
      shouldPass: false
    },
    {
      description: 'Upper bound too high >=22.13.0 <24',
      enginesNode: '>=22.13.0 <24',
      nvmrc: '22.14.0',
      shouldPass: false
    },
    {
      description: 'X-range 22.x (not a subset, allows 22.0.0-22.12.x)',
      enginesNode: '22.x',
      nvmrc: '22.14.0',
      shouldPass: false
    },
    
    // Reject cases - .nvmrc issues
    {
      description: '.nvmrc major-only "22" coerces to 22.0.0 < 22.13.0',
      enginesNode: '>=22.13.0 <23',
      nvmrc: '22',
      shouldPass: false
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    const errors = validateEngines(testCase.enginesNode, testCase.nvmrc);
    const actualPass = errors.length === 0;
    
    if (actualPass === testCase.shouldPass) {
      passed++;
      console.log(`✓ ${testCase.description}`);
      if (!actualPass && errors.length > 0) {
        console.log(`  └─ Correctly rejected: ${errors[0]}`);
      }
    } else {
      failed++;
      console.error(`✗ ${testCase.description}`);
      console.error(`  Expected: ${testCase.shouldPass ? 'PASS' : 'FAIL'}`);
      console.error(`  Got: ${actualPass ? 'PASS' : 'FAIL'}`);
      if (errors.length > 0) {
        console.error(`  Errors: ${errors.join('; ')}`);
      }
    }
  }
  
  console.log(`\n=== Test Results: ${passed}/${testCases.length} passed ===\n`);
  
  if (failed > 0) {
    console.error(`✗ ${failed} test(s) failed`);
    process.exit(1);
  }
  
  console.log('✓ All table tests passed');
}
