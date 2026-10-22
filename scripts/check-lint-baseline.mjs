/**
 * Fail only when ESLint error or warning totals rise above eslint-baseline.json.
 * Existing baseline problems stay green. `npm run lint` still prints the full report.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "eslint-baseline.json");
const eslintBin = join(root, "node_modules", "eslint", "bin", "eslint.js");

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
if (!Number.isInteger(baseline.errors) || !Number.isInteger(baseline.warnings)) {
  console.error("eslint-baseline.json must contain integer errors and warnings counts.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [eslintBin, ".", "-f", "json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0 && result.status !== 1) {
  if (result.stderr) process.stderr.write(result.stderr);
  console.error(`eslint failed with exit code ${result.status}.`);
  process.exit(result.status ?? 1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  if (result.stderr) process.stderr.write(result.stderr);
  console.error("eslint did not return JSON.");
  process.exit(1);
}

let errors = 0;
let warnings = 0;
for (const file of report) {
  errors += file.errorCount;
  warnings += file.warningCount;
}

console.log(
  `eslint: ${errors} errors, ${warnings} warnings (baseline ${baseline.errors} errors, ${baseline.warnings} warnings)`,
);

const errorsOver = errors - baseline.errors;
const warningsOver = warnings - baseline.warnings;
if (errorsOver > 0 || warningsOver > 0) {
  console.error(
    `Lint rose above the baseline by ${Math.max(errorsOver, 0)} errors and ${Math.max(warningsOver, 0)} warnings.`,
  );
  for (const file of report) {
    for (const message of file.messages) {
      const severity = message.severity === 2 ? "error" : "warning";
      const where = message.line ? `${message.line}:${message.column}` : "0:0";
      const rule = message.ruleId ? ` ${message.ruleId}` : "";
      console.error(`${file.filePath}:${where} ${severity} ${message.message}${rule}`);
    }
  }
  process.exit(1);
}
