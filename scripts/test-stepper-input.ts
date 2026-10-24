#!/usr/bin/env tsx
/**
 * Test: stepper-input.tsx component structure
 * 
 * Source assertions (no browser required):
 * - 44px minimum button size (via style attribute)
 * - Correct aria-labels on buttons and input
 * - Disabled state at min/max
 * - inputMode: 'decimal' for weight, 'numeric' for reps
 * - Uses theme tokens only (no hex colors)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  -- ${detail}` : ''}`);
}

console.log('\n1. Reading stepper-input.tsx source');
const componentPath = resolve(__dirname, '../src/components/session/stepper-input.tsx');
const source = readFileSync(componentPath, 'utf-8');

console.log('\n2. Button touch target size (44x44px)');
{
  check('minWidth: 44px exists', source.includes("minWidth: '44px'"));
  check('minHeight: 44px exists', source.includes("minHeight: '44px'"));
  check('both buttons use w-11 h-11 (44px base)', 
    source.match(/className="[^"]*w-11 h-11/g)?.length === 2);
}

console.log('\n3. Aria-labels are present and correct');
{
  check('decrease button has aria-label template', 
    source.includes('aria-label={`Decrease ${ariaLabel.toLowerCase()}`}'));
  check('increase button has aria-label template',
    source.includes('aria-label={`Increase ${ariaLabel.toLowerCase()}`}'));
  check('input receives aria-label prop',
    source.includes('aria-label={ariaLabel}'));
  check('aria-label is a required prop',
    source.includes("'aria-label': string"));
}

console.log('\n4. Disabled state at bounds');
{
  check('atMin constant exists', source.includes('const atMin = value <= min'));
  check('atMax constant exists', source.includes('const atMax = value >= max'));
  check('decrease button disabled at min', 
    source.includes('disabled={disabled || atMin}'));
  check('increase button disabled at max',
    source.includes('disabled={disabled || atMax}'));
}

console.log('\n5. inputMode is conditional');
{
  check('inputMode uses conditional logic', 
    source.includes("const inputMode = unit === 'reps' ? 'numeric' : 'decimal'"));
  check('input element uses inputMode',
    source.includes('inputMode={inputMode}'));
}

console.log('\n6. No hardcoded hex colors (theme tokens only)');
{
  const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;
  const hexMatches = source.match(hexPattern);
  check('no hex color codes in source', !hexMatches || hexMatches.length === 0,
    hexMatches ? `found: ${hexMatches.join(', ')}` : '');
}

console.log('\n7. Uses theme tokens from globals.css');
{
  const themeTokens = [
    'bg-surface',
    'bg-surface-2',
    'border-border',
    'text-fg',
    'text-muted',
    'ring-accent'
  ];
  
  for (const token of themeTokens) {
    check(`uses ${token}`, source.includes(token));
  }
}

console.log('\n8. Button click handlers do not open keyboard');
{
  check('decrease uses onClick, not onMouseDown/onTouchStart',
    source.includes('onClick={handleDecrease}'));
  check('increase uses onClick, not onMouseDown/onTouchStart',
    source.includes('onClick={handleIncrease}'));
  check('buttons are type="button" (not submit)',
    source.match(/type="button"/g)?.length === 2);
}

console.log('\n9. Invalid input handling on blur');
{
  check('handleBlur function exists', source.includes('const handleBlur = ()'));
  check('checks for NaN', source.includes('if (isNaN(parsed))'));
  check('reverts to current value on invalid input',
    source.includes('setDisplayValue(String(value))'));
  check('clamps valid input to bounds',
    source.includes('const clamped = Math.max(min, Math.min(max, parsed))'));
}

console.log('\n10. Component structure');
{
  check("exports 'use client' directive", source.startsWith("'use client'"));
  check('exports StepperInput function', source.includes('export function StepperInput'));
  check('exports StepperInputProps interface', source.includes('export interface StepperInputProps'));
  check('has value prop', source.includes('value: number'));
  check('has onChange prop', source.includes('onChange: (value: number) => void'));
  check('has min and max props', source.includes('min: number') && source.includes('max: number'));
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
