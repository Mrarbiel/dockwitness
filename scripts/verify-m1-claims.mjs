#!/usr/bin/env node
/**
 * Milestone 1 Empirical Challenger Verification Script:
 * Scans the entire codebase for forbidden claims, ensuring complete alignment
 * with Milestone 1 specifications.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const SCAN_DIRS = [
  "app",
  "components",
  "lib",
  "submission",
  "docs",
  "public",
  "tests",
  "scripts"
];

// Files known to legitimately document historical removals as audit entries
const AUDIT_ALLOWLIST = [
  "PROJECT.md",
  "submission/CLAIMS_LEDGER.md",
  "submission/qa/QA_REPORT.md",
  "submission/qa/generate-qa-report.cjs",
  "tests/repository/adversarial-repository.test.ts", // Tests object tampering defense
  "lib/domain/evidence-upload.ts", // Comment stating client cannot tamper path
  "scripts/verify-m1-claims.mjs"
];

const FORBIDDEN_PATTERNS = [
  {
    name: "Humans determine liability",
    regex: /humans\s+determine\s+liability/i,
    description: "Must use 'Humans determine responsibility.', never 'liability'."
  },
  {
    name: "tamper-proof",
    regex: /tamper-proof|tamper\s+proof/i,
    description: "Unsupported claim: tamper-proof."
  },
  {
    name: "SHA-256 hash / photo fingerprinting",
    regex: /sha-256\s+hash|sha-256\s+photo|cryptographic\s+hash/i,
    description: "Unsupported claim: SHA-256 photo hash."
  },
  {
    name: "cryptographically anchored",
    regex: /cryptographically[- ]anchored|cryptographically[- ]chained/i,
    description: "Unsupported claim: cryptographically anchored."
  },
  {
    name: "cryptographic salt",
    regex: /cryptographic\s+salt/i,
    description: "Unsupported claim: cryptographic salt."
  },
  {
    name: "legally-grounded",
    regex: /legally[- ]grounded/i,
    description: "Unsupported claim: legally-grounded."
  },
  {
    name: "Outdated driver statement ('opened the doors')",
    regex: /opened\s+the\s+doors/i,
    description: "Obsolete driver statement variant."
  },
  {
    name: "Outdated driver statement ('when we backed in')",
    regex: /when\s+we\s+backed\s+in/i,
    description: "Obsolete driver statement variant."
  },
  {
    name: "Outdated driver statement ('loaded at origin')",
    regex: /loaded\s+at\s+origin/i,
    description: "Obsolete driver statement variant."
  },
  {
    name: "Carton 31 puncture claim",
    regex: /carton\s+(?:31|thirty-one).{0,40}puncture|puncture.{0,40}carton\s+(?:31|thirty-one)/i,
    description: "Carton 31 must be 'crushed underneath and wet', not punctured."
  }
];

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".srt", ".html", ".typ", ".css"
]);

function walkDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === ".next" ||
        entry.name === ".agents" ||
        entry.name === "dist" ||
        entry.name === "coverage"
      ) {
        continue;
      }
      walkDir(fullPath, fileList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (TEXT_EXTENSIONS.has(ext)) {
        fileList.push({ fullPath, relPath });
      }
    }
  }
  return fileList;
}

console.log("================================================================================");
console.log("Milestone 1 Empirical Challenger: Scanning for Forbidden Claims & Invariants");
console.log("================================================================================\n");

let allFiles = [];
for (const dir of SCAN_DIRS) {
  walkDir(path.join(ROOT_DIR, dir), allFiles);
}
// Also include root documentation/config files
const rootFiles = fs.readdirSync(ROOT_DIR, { withFileTypes: true })
  .filter(d => d.isFile() && TEXT_EXTENSIONS.has(path.extname(d.name).toLowerCase()))
  .map(d => ({ fullPath: path.join(ROOT_DIR, d.name), relPath: d.name }));
allFiles.push(...rootFiles);

console.log(`Scanned ${allFiles.length} files across the repository.\n`);

let violations = [];

for (const { fullPath, relPath } of allFiles) {
  if (AUDIT_ALLOWLIST.includes(relPath)) {
    continue;
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.regex.test(line)) {
        violations.push({
          file: relPath,
          line: idx + 1,
          rule: pattern.name,
          description: pattern.description,
          content: line.trim()
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error(`❌ Found ${violations.length} forbidden claim violations:\n`);
  for (const v of violations) {
    console.error(`[${v.rule}] ${v.file}:${v.line}`);
    console.error(`  Desc: ${v.description}`);
    console.error(`  Code: ${v.content}\n`);
  }
  process.exit(1);
} else {
  console.log("✅ Zero forbidden claims found across all scanned repository files!");
  console.log("  - 'Humans determine liability': 0 occurrences");
  console.log("  - 'tamper-proof': 0 occurrences");
  console.log("  - 'SHA-256 photo hash': 0 occurrences");
  console.log("  - 'cryptographically anchored': 0 occurrences");
  console.log("  - 'cryptographic salt': 0 occurrences");
  console.log("  - 'legally-grounded': 0 occurrences");
  console.log("  - Outdated driver statements: 0 occurrences");
  console.log("  - Carton 31 puncture claims: 0 occurrences");
  process.exit(0);
}
