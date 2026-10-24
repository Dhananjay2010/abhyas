export {};
/**
 * Breathe button accessibility test.
 *
 * Every button in breathe/ must have an accessible name: either text content
 * or an aria-label attribute.
 *
 *   npx tsx scripts/test-breathe-button-a11y.ts
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function findTsxFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      results.push(...findTsxFiles(fullPath));
    } else if (entry.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  
  return results;
}

// Simple regex-based check for buttons without accessible names
// This catches common patterns but may have false positives/negatives
function checkButtonsInFile(filePath: string): { ok: boolean; issues: string[] } {
  const content = readFileSync(filePath, 'utf-8');
  const issues: string[] = [];
  
  // Find all button tags
  const buttonRegex = /<button[^>]*>/g;
  let match;
  
  while ((match = buttonRegex.exec(content)) !== null) {
    const buttonTag = match[0];
    const buttonStart = match.index;
    
    // Skip if it has aria-label
    if (/aria-label=["'][^"']+["']/.test(buttonTag)) {
      continue;
    }
    
    // Check if button has text content by finding the closing tag
    const closingTagStart = content.indexOf('</button>', buttonStart);
    if (closingTagStart === -1) continue;
    
    const buttonContent = content.substring(buttonStart + buttonTag.length, closingTagStart).trim();
    
    // Check for text content (not just whitespace or icons)
    // Icons are typically: <Icon.Something />, <svg..., or aria-hidden elements
    const hasTextContent = buttonContent.length > 0 && 
      !/^<(Icon\.|svg|span[^>]*aria-hidden)/.test(buttonContent.trim()) &&
      /[a-zA-Z]/.test(buttonContent);
    
    if (!hasTextContent) {
      // Get line number for reporting
      const lineNumber = content.substring(0, buttonStart).split('\n').length;
      issues.push(`Line ${lineNumber}: ${buttonTag.substring(0, 80)}...`);
    }
  }
  
  return { ok: issues.length === 0, issues };
}

console.log("\nChecking buttons in breathe/ for accessible names...\n");

const breatheDir = join(process.cwd(), 'src/app/breathe');
const files = findTsxFiles(breatheDir);

console.log(`Found ${files.length} .tsx files in breathe/\n`);

let totalIssues = 0;

for (const file of files) {
  const relativePath = file.replace(process.cwd() + '/', '');
  const result = checkButtonsInFile(file);
  
  if (!result.ok) {
    console.log(`\n${relativePath}:`);
    for (const issue of result.issues) {
      console.log(`  FAIL ${issue}`);
      totalIssues++;
    }
  }
}

if (totalIssues === 0) {
  console.log("ALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.log(`\n${totalIssues} button(s) without accessible names found\n`);
  process.exit(1);
}
