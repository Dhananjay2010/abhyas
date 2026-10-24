/**
 * Checks that Breathe component files don't have hard-coded hex colors.
 * Primary action buttons should use theme tokens (bg-accent, text-accent-fg, etc.).
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

let failures = 0;

const BREATHE_DIR = join(process.cwd(), "src/app/breathe");

// Files we're modifying as part of this PR
const MODIFIED_FILES = [
  "breathe-home.tsx",
  "prefs-sheet.tsx",
  "[slug]/practice-setup.tsx",
  "routine/[slug]/routine-setup.tsx",
  "[slug]/session/breathing-session.tsx",
];

function getAllTsxFiles(dir: string, baseDir: string = dir): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getAllTsxFiles(fullPath, baseDir));
    } else if (entry.endsWith(".tsx")) {
      files.push(fullPath.substring(baseDir.length + 1));
    }
  }

  return files;
}

function checkFileForHexColors(relativePath: string): void {
  const fullPath = join(BREATHE_DIR, relativePath);
  const content = readFileSync(fullPath, "utf-8");
  
  const lines = content.split("\n");
  const problemLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Only check lines that are button elements or className attributes
    const isButtonContext = 
      line.includes("<button") || 
      line.includes("className") ||
      (line.trim().startsWith("className") && !line.includes("//"));
    
    if (!isButtonContext) continue;

    // Match hex color patterns in button/className contexts:
    // - #RGB, #RRGGBB, #RRGGBBAA
    // - Tailwind arbitrary values like bg-[#...]
    const hexColorPattern = /#[0-9a-fA-F]{3,8}\b/g;
    const matches = line.match(hexColorPattern);

    if (matches && matches.length > 0) {
      problemLines.push(`   Line ${i + 1}: ${line.trim()}`);
    }
  }

  if (problemLines.length > 0) {
    console.error(`❌ ${relativePath} contains hex color codes in button/className:`);
    for (const line of problemLines) {
      console.error(line);
    }
    failures++;
  } else {
    console.log(`✓ ${relativePath}`);
  }
}

console.log("Checking Breathe files for hard-coded hex colors...\n");

const allFiles = getAllTsxFiles(BREATHE_DIR);
const filesToCheck = allFiles.filter(file => MODIFIED_FILES.includes(file));

if (filesToCheck.length === 0) {
  console.log("Note: No modified Breathe files found to check.");
} else {
  for (const file of filesToCheck) {
    checkFileForHexColors(file);
  }
}

console.log(`\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All files clean" : `${failures} file(s) with hex colors`}`);
process.exit(failures === 0 ? 0 : 1);
