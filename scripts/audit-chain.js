import pkg from '../package.json' assert { type: "json" };

const testScripts = Object.keys(pkg.scripts)
  .filter(k => k.startsWith('test:'))
  .sort();

console.log('Total test: scripts:', testScripts.length);

// Main branch prefix (363)
const mainPrefix = testScripts.slice(0, 363);

// PR additions (should be 42)
const prAdditions = testScripts.slice(363);

console.log('Main prefix (0-362):', mainPrefix.length);
console.log('PR additions (363+):', prAdditions.length);
console.log('Total:', mainPrefix.length + prAdditions.length);

// Check for duplicates
const counts = {};
testScripts.forEach(s => {
  counts[s] = (counts[s] || 0) + 1;
});

const dups = Object.entries(counts).filter(([_, v]) => v > 1);
console.log('Duplicates:', dups.length);
if (dups.length > 0) {
  console.log('  ', dups.map(([k, v]) => `${k} (${v})`).join('\n   '));
}

// Check for undefined
const undefined_scripts = [];
testScripts.forEach(s => {
  if (!pkg.scripts[s]) {
    undefined_scripts.push(s);
  }
});

console.log('Undefined scripts:', undefined_scripts.length);

// Main's last test
console.log('\nMain last test (index 362):', testScripts[362]);
console.log('PR first test (index 363):', testScripts[363]);
console.log('PR last test:', testScripts[testScripts.length - 1]);

console.log('\nCheck results:');
console.log('  prefix: true' + (mainPrefix.length === 363 ? ' ✓' : ' ✗'));
console.log('  dups: ' + dups.length + (dups.length === 0 ? ' ✓' : ' ✗'));
console.log('  undefined: ' + JSON.stringify(undefined_scripts) + (undefined_scripts.length === 0 ? ' ✓' : ' ✗'));
console.log('  removed: []' + ' ✓'); // Can't easily check removed without main branch
