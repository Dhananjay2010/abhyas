#!/usr/bin/env node
/**
 * Calculate contrast ratios for the paused hint text
 */

function rgbToLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function blendColor(fg: [number, number, number], bg: [number, number, number], alpha: number): [number, number, number] {
  return [
    Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
    Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
    Math.round(fg[2] * alpha + bg[2] * (1 - alpha)),
  ];
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

// Colors
const breathInk = hexToRgb('#dcf3f1'); // text-breath-ink
const pauseBg = hexToRgb('#0f1d2a'); // pause dialog background

console.log('\n🎨 Paused Hint Text Contrast Analysis\n');
console.log(`breath-ink color: #dcf3f1 = rgb(${breathInk.join(', ')})`);
console.log(`pause dialog background: #0f1d2a = rgb(${pauseBg.join(', ')})`);
console.log();

// Current: 70% opacity
const current70 = blendColor(breathInk, pauseBg, 0.7);
const currentHex = rgbToHex(...current70);
const currentLum = rgbToLuminance(...current70);
const bgLum = rgbToLuminance(...pauseBg);
const currentContrast = contrastRatio(currentLum, bgLum);

console.log('1️⃣  Current (text-breath-ink/70):');
console.log(`   Blended color: ${currentHex} = rgb(${current70.join(', ')})`);
console.log(`   Contrast ratio: ${currentContrast.toFixed(2)}:1`);
console.log(`   WCAG AA (4.5:1): ${currentContrast >= 4.5 ? '✅ PASS' : '❌ FAIL'}`);
console.log();

// Option 1: 100% opacity
const fullOpacity = breathInk;
const fullLum = rgbToLuminance(...fullOpacity);
const fullContrast = contrastRatio(fullLum, bgLum);

console.log('2️⃣  Full opacity (text-breath-ink):');
console.log(`   Color: #dcf3f1 = rgb(${fullOpacity.join(', ')})`);
console.log(`   Contrast ratio: ${fullContrast.toFixed(2)}:1`);
console.log(`   WCAG AA (4.5:1): ${fullContrast >= 4.5 ? '✅ PASS' : '❌ FAIL'}`);
console.log();

// Option 2: 85% opacity
const opacity85 = blendColor(breathInk, pauseBg, 0.85);
const hex85 = rgbToHex(...opacity85);
const lum85 = rgbToLuminance(...opacity85);
const contrast85 = contrastRatio(lum85, bgLum);

console.log('3️⃣  85% opacity (text-breath-ink/85):');
console.log(`   Blended color: ${hex85} = rgb(${opacity85.join(', ')})`);
console.log(`   Contrast ratio: ${contrast85.toFixed(2)}:1`);
console.log(`   WCAG AA (4.5:1): ${contrast85 >= 4.5 ? '✅ PASS' : '❌ FAIL'}`);
console.log();

console.log('📊 Recommendation:');
if (fullContrast >= 4.5) {
  console.log(`   Use text-breath-ink (full opacity) - ${fullContrast.toFixed(2)}:1 ✅`);
} else if (contrast85 >= 4.5) {
  console.log(`   Use text-breath-ink/85 - ${contrast85.toFixed(2)}:1 ✅`);
} else {
  console.log(`   ⚠️  Even full opacity (${fullContrast.toFixed(2)}:1) may not meet WCAG AA`);
}
console.log();
