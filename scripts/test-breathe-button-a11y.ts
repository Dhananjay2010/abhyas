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
import * as ts from "typescript";

let failures = 0;

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

function checkButtonsInFile(filePath: string): { ok: boolean; issues: string[] } {
  const content = readFileSync(filePath, 'utf-8');
  const issues: string[] = [];
  
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = ts.isJsxElement(node)
        ? node.openingElement.tagName.getText(sourceFile)
        : node.tagName.getText(sourceFile);
      
      if (tagName === "button") {
        let hasAriaLabel = false;
        let hasTextContent = false;
        
        // Check for aria-label attribute
        const attributes = ts.isJsxElement(node)
          ? node.openingElement.attributes.properties
          : node.attributes.properties;
        
        for (const attr of attributes) {
          if (ts.isJsxAttribute(attr)) {
            const attrName = attr.name.getText(sourceFile);
            if (attrName === "aria-label") {
              hasAriaLabel = true;
              break;
            }
          }
        }
        
        // Check for text content in JSX element
        if (ts.isJsxElement(node)) {
          function hasTextInChildren(children: ts.NodeArray<ts.JsxChild>): boolean {
            for (const child of children) {
              if (ts.isJsxText(child)) {
                const text = child.getText(sourceFile).trim();
                if (text.length > 0 && /[a-zA-Z]/.test(text)) {
                  return true;
                }
              } else if (ts.isJsxExpression(child) && child.expression) {
                // Check if expression is a string literal or template
                const exprText = child.expression.getText(sourceFile);
                if (exprText && /[a-zA-Z]/.test(exprText)) {
                  return true;
                }
              } else if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
                // Recursively check nested JSX elements (but not aria-hidden ones)
                
                // Skip aria-hidden elements
                const childAttrs = ts.isJsxElement(child)
                  ? child.openingElement.attributes.properties
                  : child.attributes.properties;
                
                let isAriaHidden = false;
                for (const attr of childAttrs) {
                  if (ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === "aria-hidden") {
                    isAriaHidden = true;
                    break;
                  }
                }
                
                if (!isAriaHidden && ts.isJsxElement(child)) {
                  if (hasTextInChildren(child.children)) {
                    return true;
                  }
                }
              }
            }
            return false;
          }
          
          hasTextContent = hasTextInChildren(node.children);
        }
        
        if (!hasAriaLabel && !hasTextContent) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          const buttonText = node.getText(sourceFile).substring(0, 80);
          issues.push(`Line ${line + 1}: ${buttonText}...`);
        }
      }
    }
    
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  
  return { ok: issues.length === 0, issues };
}

console.log("\nChecking buttons in breathe/ for accessible names...\n");

const breatheDir = join(process.cwd(), 'src/app/breathe');
const files = findTsxFiles(breatheDir);

console.log(`Found ${files.length} .tsx files in breathe/\n`);

for (const file of files) {
  const relativePath = file.replace(process.cwd() + '/', '');
  const result = checkButtonsInFile(file);
  
  if (!result.ok) {
    console.log(`\n${relativePath}:`);
    for (const issue of result.issues) {
      failures++;
      console.log(`  FAIL ${issue}`);
    }
  }
}

if (failures === 0) {
  console.log("ALL CHECKS PASSED\n");
} else {
  console.log(`\n❌ ${failures} button(s) without accessible names found\n`);
  process.exit(1);
}
