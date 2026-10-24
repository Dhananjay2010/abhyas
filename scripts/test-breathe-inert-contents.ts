export {};
/**
 * Test that the inert wrapper in breathing-session.tsx has className="contents".
 *
 * The wrapper must use className="contents" to preserve the flex container layout
 * and prevent the pause dialog from breaking vertical spacing.
 *
 *   npx tsx scripts/test-breathe-inert-contents.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import * as ts from "typescript";

const filePath = join(process.cwd(), 'src/app/breathe/[slug]/session/breathing-session.tsx');
const content = readFileSync(filePath, 'utf-8');

const sourceFile = ts.createSourceFile(
  filePath,
  content,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

let foundInertWrapper = false;
let hasContentsClass = false;
let hasInertAttribute = false;

function visit(node: ts.Node) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const tagName = ts.isJsxElement(node)
      ? node.openingElement.tagName.getText(sourceFile)
      : node.tagName.getText(sourceFile);
    
    if (tagName === "div") {
      const attributes = ts.isJsxElement(node)
        ? node.openingElement.attributes.properties
        : node.attributes.properties;
      
      let hasClassName = false;
      let classNameValue = "";
      let hasInert = false;
      
      for (const attr of attributes) {
        if (ts.isJsxAttribute(attr)) {
          const attrName = attr.name.getText(sourceFile);
          
          if (attrName === "className" && attr.initializer) {
            hasClassName = true;
            if (ts.isStringLiteral(attr.initializer)) {
              classNameValue = attr.initializer.text;
            }
          }
          
          if (attrName === "inert") {
            hasInert = true;
          }
        }
      }
      
      // Check if this is the inert wrapper with className="contents"
      if (hasClassName && hasInert) {
        foundInertWrapper = true;
        hasContentsClass = classNameValue === "contents";
        hasInertAttribute = true;
      }
    }
  }
  
  ts.forEachChild(node, visit);
}

visit(sourceFile);

console.log("\nChecking inert wrapper in breathing-session.tsx...\n");

if (!foundInertWrapper) {
  console.log("❌ FAIL: No div with both className and inert attributes found\n");
  process.exit(1);
}

if (!hasContentsClass) {
  console.log("❌ FAIL: Inert wrapper does not have className=\"contents\"\n");
  process.exit(1);
}

if (!hasInertAttribute) {
  console.log("❌ FAIL: Inert wrapper missing inert attribute\n");
  process.exit(1);
}

console.log("✓ Found inert wrapper with className=\"contents\"");
console.log("ALL CHECKS PASSED\n");
