import { readFileSync } from 'fs';
import { join } from 'path';

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

const nvmrcParts = nvmrc.split('.').map(Number);
const currentParts = process.version.slice(1).split('.').map(Number);

if (nvmrcParts[0] !== 22) {
  console.error(`✗ .nvmrc major version must be 22, got ${nvmrcParts[0]}`);
  process.exit(1);
}

if (currentParts[0] !== 22) {
  console.error(`✗ Current Node major version must be 22, got ${currentParts[0]}`);
  process.exit(1);
}

const nvmrcSemver = nvmrcParts[0] * 10000 + nvmrcParts[1] * 100 + nvmrcParts[2];
const requiredMinimum = 22 * 10000 + 13 * 100 + 0;

if (nvmrcSemver < requiredMinimum) {
  console.error(`✗ .nvmrc version ${nvmrc} is below required minimum 22.13.0`);
  process.exit(1);
}

if (!enginesNode.includes('>=22.13.0')) {
  console.error(`✗ engines.node must require >=22.13.0, got: ${enginesNode}`);
  process.exit(1);
}

if (!enginesNode.includes('<23')) {
  console.error(`✗ engines.node must restrict to <23, got: ${enginesNode}`);
  process.exit(1);
}

console.log('✓ Node version requirements validated');
console.log('  - .nvmrc is 22.x');
console.log('  - .nvmrc is >= 22.13.0');
console.log('  - engines.node requires >=22.13.0 <23');
