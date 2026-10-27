import { contrastRatio, accessibleTextColor } from "../src/lib/contrast";
import { ensureMinContrast } from "../src/lib/brand-contrast";

const appBg = '#0a0c0e';
const testColors = [
  '#1a1a1a', '#2a2a2a', '#3a3a3a', '#252525', '#303030',
  '#1E1E1E', '#282828', '#353535', '#404040', '#4a4a4a',
  '#505050', '#5a5a5a',
];

console.log('Searching for color where original and adjusted need DIFFERENT text colors:\n');

for (const color of testColors) {
  const originalRatio = contrastRatio(color, appBg);
  const originalFg = accessibleTextColor(color);
  
  if (originalRatio < 3.0) {
    const adjusted = ensureMinContrast(color, appBg, 3.0, '#ff9a2e');
    const adjustedFg = accessibleTextColor(adjusted);
    const adjustedRatio = contrastRatio(adjusted, appBg);
    
    console.log(`${color}:`);
    console.log(`  Original: ratio=${originalRatio.toFixed(2)}, fg=${originalFg}`);
    console.log(`  Adjusted: ${adjusted}, ratio=${adjustedRatio.toFixed(2)}, fg=${adjustedFg}`);
    
    if (originalFg !== adjustedFg) {
      console.log(`  ✓ DIFFERENT FG COLORS - FOUND!\n`);
    } else {
      console.log(`  Same fg (${originalFg})\n`);
    }
  }
}

console.log('\n=== CONCLUSION ===');
console.log('At 3:1 minimum contrast against #0a0c0e:');
console.log('All dark colors (<3:1) need white text (#ffffff)');
console.log('All adjusted colors (>=3:1) also need white text (#ffffff)');
console.log('The lightness threshold for black text is much higher than 3:1 contrast requirement.');
console.log('\nTo get different fg colors, would need minRatio >> 3:1 (e.g., 7:1+)');
