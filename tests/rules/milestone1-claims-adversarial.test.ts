import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT_DIR = path.resolve(__dirname, "../..");

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

const AUDIT_ALLOWLIST = new Set([
  "PROJECT.md",
  "submission/CLAIMS_LEDGER.md",
  "submission/qa/QA_REPORT.md",
  "submission/qa/generate-qa-report.cjs",
  "tests/repository/adversarial-repository.test.ts",
  "lib/domain/evidence-upload.ts",
  "scripts/verify-m1-claims.mjs",
  "tests/rules/milestone1-claims-adversarial.test.ts"
]);

const FORBIDDEN_RULES = [
  {
    name: "Humans determine liability",
    regex: /humans\s+determine\s+liability/i,
  },
  {
    name: "tamper-proof",
    regex: /tamper-proof|tamper\s+proof/i,
  },
  {
    name: "SHA-256 photo hash / fingerprinting",
    regex: /sha-256\s+hash|sha-256\s+photo|cryptographic\s+hash/i,
  },
  {
    name: "cryptographically anchored",
    regex: /cryptographically[- ]anchored|cryptographically[- ]chained/i,
  },
  {
    name: "cryptographic salt",
    regex: /cryptographic\s+salt/i,
  },
  {
    name: "legally-grounded",
    regex: /legally[- ]grounded/i,
  },
  {
    name: "Outdated driver statement ('opened the doors')",
    regex: /opened\s+the\s+doors/i,
  },
  {
    name: "Outdated driver statement ('when we backed in')",
    regex: /when\s+we\s+backed\s+in/i,
  },
  {
    name: "Outdated driver statement ('loaded at origin')",
    regex: /loaded\s+at\s+origin/i,
  },
  {
    name: "Carton 31 puncture claim",
    regex: /carton\s+(?:31|thirty-one).{0,40}puncture|puncture.{0,40}carton\s+(?:31|thirty-one)/i,
  }
];

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".srt", ".html", ".typ", ".css"
]);

function getRepositoryFiles(): { fullPath: string; relPath: string }[] {
  const fileList: { fullPath: string; relPath: string }[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(ROOT_DIR, full).replace(/\\/g, "/");

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
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (TEXT_EXTENSIONS.has(ext)) {
          fileList.push({ fullPath: full, relPath: rel });
        }
      }
    }
  }

  for (const d of SCAN_DIRS) {
    walk(path.join(ROOT_DIR, d));
  }

  const rootEntries = fs.readdirSync(ROOT_DIR, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      fileList.push({
        fullPath: path.join(ROOT_DIR, entry.name),
        relPath: entry.name.replace(/\\/g, "/")
      });
    }
  }

  return fileList;
}

describe("Milestone 1 Empirical Challenger: Claims & Invariants Adversarial Audit", () => {
  const files = getRepositoryFiles();

  it("finds zero occurrences of forbidden claims across all active repository files", () => {
    const violations: string[] = [];

    for (const { fullPath, relPath } of files) {
      if (AUDIT_ALLOWLIST.has(relPath)) continue;

      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, idx) => {
        for (const rule of FORBIDDEN_RULES) {
          if (rule.regex.test(line)) {
            violations.push(`[${rule.name}] ${relPath}:${idx + 1} -> ${line.trim()}`);
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("verifies canonical golden demo quotes are present in key submission media", () => {
    const srtPath = path.join(ROOT_DIR, "submission/artifacts/DockWitness-Pitch.srt");
    expect(fs.existsSync(srtPath)).toBe(true);
    const srt = fs.readFileSync(srtPath, "utf-8");

    // Canonical receiver quote in SRT
    expect(srt).toContain(
      "I have forty-seven cartons. Carton thirty-one is crushed underneath and wet on the right side."
    );

    // Canonical driver quote in SRT
    expect(srt).toContain(
      "Driver: 'I confirm the damaged carton, but I dispute the shortage. The seal was intact.'"
    );
  });
});
