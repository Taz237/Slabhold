/**
 * Compare ESLint findings to eslint-baseline.json.
 *
 * Each entry is "severity file:rule" with a count. Line and column are ignored.
 * Exit 1 when a count rises, a new entry appears, ESLint crashes, or the baseline
 * is missing or malformed. A drop is not a failure: print LOWER_BASELINE_MESSAGE.
 *
 * `node scripts/check-lint-baseline.mjs --write` rewrites the baseline (npm run lint:baseline).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LOWER_BASELINE_MESSAGE = "lower the baseline: run npm run lint:baseline";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "eslint-baseline.json");
const eslintBin = join(root, "node_modules", "eslint", "bin", "eslint.js");

export function toPosixRelative(rootDir, filePath) {
  return relative(rootDir, filePath).split(sep).join("/");
}

export function findingKey(severity, file, rule) {
  return `${severity} ${file}:${rule || "(no-rule)"}`;
}

export function collectFindings(report, rootDir) {
  const counts = new Map();
  const details = new Map();
  for (const file of report) {
    if (!Array.isArray(file.messages)) continue;
    const rel = toPosixRelative(rootDir, file.filePath);
    for (const message of file.messages) {
      const severity = message.severity === 2 ? "error" : "warning";
      const finding = findingKey(severity, rel, message.ruleId);
      counts.set(finding, (counts.get(finding) ?? 0) + 1);
      const where = `${rel}:${message.line ?? 0}:${message.column ?? 0}`;
      const rule = message.ruleId ? ` ${message.ruleId}` : "";
      const detail = `${where} ${severity} ${message.message}${rule}`;
      if (!details.has(finding)) details.set(finding, []);
      details.get(finding).push(detail);
    }
  }
  return { counts, details };
}

export function totals(counts) {
  let errors = 0;
  let warnings = 0;
  for (const [finding, count] of counts) {
    if (finding.startsWith("error ")) errors += count;
    else if (finding.startsWith("warning ")) warnings += count;
  }
  return { errors, warnings };
}

function splitFinding(finding) {
  if (typeof finding !== "string") return null;
  const space = finding.indexOf(" ");
  if (space <= 0) return null;
  const severity = finding.slice(0, space);
  if (severity !== "error" && severity !== "warning") return null;
  const rest = finding.slice(space + 1);
  const colon = rest.lastIndexOf(":");
  if (colon <= 0 || colon === rest.length - 1) return null;
  const file = rest.slice(0, colon);
  const rule = rest.slice(colon + 1);
  if (!file || !rule || rule.includes(":") || file.includes("\n") || rule.includes("\n")) return null;
  return { severity, file, rule };
}

export function parseBaseline(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { error: 'eslint-baseline.json is malformed. Expected an object of "severity file:rule" counts.' };
  }
  const entries = [];
  for (const [finding, count] of Object.entries(data)) {
    if (!splitFinding(finding) || !Number.isInteger(count) || count < 1) {
      return { error: `eslint-baseline.json is malformed at ${JSON.stringify(finding)}.` };
    }
    entries.push([finding, count]);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { entries };
}

export function readBaselineFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return { error: "eslint-baseline.json is missing." };
    throw error;
  }
  try {
    return parseBaseline(JSON.parse(text));
  } catch {
    return { error: "eslint-baseline.json is malformed JSON." };
  }
}

export function sortedEntries(counts) {
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

export function diffFindings(baselineEntries, currentCounts) {
  const baseline = new Map(baselineEntries);
  const raised = [];
  const added = [];
  const lowered = [];
  for (const [finding, count] of currentCounts) {
    if (!baseline.has(finding)) added.push({ finding, count });
    else if (count > baseline.get(finding)) raised.push({ finding, from: baseline.get(finding), count });
    else if (count < baseline.get(finding)) lowered.push({ finding, from: baseline.get(finding), count });
  }
  for (const [finding, count] of baseline) {
    if (!currentCounts.has(finding)) lowered.push({ finding, from: count, count: 0 });
  }
  const byFinding = (a, b) => (a.finding < b.finding ? -1 : a.finding > b.finding ? 1 : 0);
  raised.sort(byFinding);
  added.sort(byFinding);
  lowered.sort(byFinding);
  return { raised, added, lowered };
}

function runEslint() {
  const result = spawnSync(
    process.execPath,
    [eslintBin, ".", "-f", "json", "--report-unused-disable-directives"],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0 && result.status !== 1) {
    if (result.stderr) process.stderr.write(result.stderr);
    console.error(`eslint failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    if (result.stderr) process.stderr.write(result.stderr);
    console.error("eslint did not return JSON.");
    process.exit(1);
  }
}

function writeBaseline(entries) {
  const doc = {};
  for (const [finding, count] of entries) doc[finding] = count;
  writeFileSync(baselinePath, `${JSON.stringify(doc, null, 2)}\n`);
}

function printNewFindings(items, details, label) {
  for (const item of items) {
    const countLabel = item.from === undefined ? `${item.count}` : `${item.from} -> ${item.count}`;
    console.error(`${label} ${item.finding} (${countLabel})`);
    for (const line of details.get(item.finding) ?? []) console.error(`  ${line}`);
  }
}

function main() {
  const write = process.argv.includes("--write");
  const report = runEslint();
  const { counts, details } = collectFindings(report, root);
  const current = totals(counts);
  const entries = sortedEntries(counts);

  if (write) {
    writeBaseline(entries);
    console.log(
      `Wrote eslint-baseline.json: ${current.errors} errors, ${current.warnings} warnings, ${entries.length} findings.`,
    );
    return;
  }

  const loaded = readBaselineFile(baselinePath);
  if (loaded.error) {
    console.error(loaded.error);
    process.exit(1);
  }

  const base = totals(new Map(loaded.entries));
  console.log(
    `eslint: ${current.errors} errors, ${current.warnings} warnings (baseline ${base.errors} errors, ${base.warnings} warnings)`,
  );

  const { raised, added, lowered } = diffFindings(loaded.entries, counts);
  if (added.length > 0 || raised.length > 0) {
    console.error("Lint findings rose above the baseline.");
    printNewFindings(added, details, "new");
    printNewFindings(raised, details, "rose");
  }
  if (lowered.length > 0) {
    for (const item of lowered) {
      console.error(`dropped ${item.finding} (${item.from} -> ${item.count})`);
    }
    console.error(LOWER_BASELINE_MESSAGE);
  }
  if (added.length > 0 || raised.length > 0) process.exit(1);
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entryPath === import.meta.url) main();
