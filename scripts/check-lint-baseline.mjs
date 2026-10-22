/**
 * Compare ESLint findings to eslint-baseline.json.
 *
 * Each entry is "severity file:rule" with a count. Line and column are ignored.
 * Exit 1 when a count rises, a new entry appears, a blanket eslint-disable names
 * no rule, a scanned file fails to parse, ESLint crashes, or the baseline is
 * missing or malformed. A drop is not a failure: print LOWER_BASELINE_MESSAGE.
 *
 * Blanket disables are read from ESLint's file list with @typescript-eslint/parser.
 * They are never written into the baseline, including with `--allow-increase`.
 *
 * `node scripts/check-lint-baseline.mjs --write` rewrites the baseline when counts
 * only stay the same or fall. Adding or raising entries requires `--allow-increase`.
 * A lower baseline prints each dropped entry and does not print LOWER_BASELINE_MESSAGE.
 */
import { parse } from "@typescript-eslint/parser";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LOWER_BASELINE_MESSAGE = "lower the baseline: run npm run lint:baseline";
export const BLANKET_RULE = "(blanket-disable)";
export const PARSE_ERROR_RULE = "(parse-error)";
const DIRECTIVE_PATTERN = /^(eslint-disable|eslint-disable-line|eslint-disable-next-line)(?:\s|$)/u;
const JUSTIFICATION_PATTERN = /\s-{2,}\s/u;
const QUOTED_RULE_PATTERN = /^(?<quote>['"]?)(?<ruleId>.*)\k<quote>$/su;

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

function ruleNames(value) {
  if (!value) return [];
  const names = [];
  for (const part of value.split(",")) {
    const trimmed = part.trim().replace(QUOTED_RULE_PATTERN, "$<ruleId>");
    if (trimmed) names.push(trimmed);
  }
  return names;
}

export function parseDisableDirective(commentValue, commentType) {
  if (typeof commentValue !== "string") return null;
  const justification = JUSTIFICATION_PATTERN.exec(commentValue);
  const directivePart = (justification ? commentValue.slice(0, justification.index) : commentValue).trim();
  const match = DIRECTIVE_PATTERN.exec(directivePart);
  if (!match) return null;
  const label = match[1];
  if (label === "eslint-disable" && commentType !== "Block") return null;
  const rules = ruleNames(directivePart.slice(label.length));
  return { label, rules, blanket: rules.length === 0 };
}

export function findBlanketDisables(source, file = "file.ts") {
  const ast = parse(source, {
    comment: true,
    jsx: /\.(tsx|jsx)$/.test(file),
    range: true,
    loc: true,
  });
  const hits = [];
  for (const comment of ast.comments ?? []) {
    if (!parseDisableDirective(comment.value, comment.type)?.blanket) continue;
    const start = comment.loc?.start;
    hits.push({
      line: start?.line ?? 0,
      column: (start?.column ?? 0) + 1,
    });
  }
  return hits;
}

export function filesFromReport(report) {
  if (!Array.isArray(report)) return [];
  const files = [];
  for (const file of report) {
    if (file && typeof file.filePath === "string" && file.filePath) files.push(file.filePath);
  }
  return files;
}

function resolveSourcePath(rootDir, filePath) {
  return isAbsolute(filePath) ? filePath : join(rootDir, filePath);
}

function parseFailure(error) {
  const message = (error instanceof Error ? error.message : String(error)).split("\n")[0];
  const line = Number.isInteger(error?.lineNumber) ? error.lineNumber : 1;
  const column = Number.isInteger(error?.column) ? error.column + 1 : 1;
  return { line, column, message };
}

export function scanBlanketDisables(rootDir, files) {
  const hits = [];
  const parseErrors = [];
  for (const filePath of files) {
    const absolute = resolveSourcePath(rootDir, filePath);
    const file = toPosixRelative(rootDir, absolute);
    let source;
    try {
      source = readFileSync(absolute, "utf8");
    } catch (error) {
      parseErrors.push({ file, ...parseFailure(error) });
      continue;
    }
    try {
      for (const hit of findBlanketDisables(source, absolute)) {
        hits.push({ file, line: hit.line, column: hit.column });
      }
    } catch (error) {
      parseErrors.push({ file, ...parseFailure(error) });
    }
  }
  return { hits, parseErrors };
}

function addErrorFinding(counts, details, finding, detail) {
  counts.set(finding, (counts.get(finding) ?? 0) + 1);
  if (!details.has(finding)) details.set(finding, []);
  details.get(finding).push(detail);
}

export function addBlanketFindings(counts, details, hits) {
  for (const hit of hits) {
    const finding = findingKey("error", hit.file, BLANKET_RULE);
    addErrorFinding(
      counts,
      details,
      finding,
      `${hit.file}:${hit.line}:${hit.column} error blanket eslint-disable ${BLANKET_RULE}`,
    );
  }
}

export function addParseErrors(counts, details, parseErrors) {
  for (const failure of parseErrors) {
    const finding = findingKey("error", failure.file, PARSE_ERROR_RULE);
    addErrorFinding(
      counts,
      details,
      finding,
      `${failure.file}:${failure.line}:${failure.column} error ${failure.message} ${PARSE_ERROR_RULE}`,
    );
  }
}

export function hasBlanketFinding(counts) {
  for (const finding of counts.keys()) {
    if (finding.endsWith(`:${BLANKET_RULE}`)) return true;
  }
  return false;
}

export function exitCodeForDiff(diff) {
  return diff.added.length > 0 || diff.raised.length > 0 ? 1 : 0;
}

export function allowsBaselineWrite(diff, allowIncrease) {
  for (const item of [...diff.added, ...diff.raised]) {
    if (item.finding.endsWith(`:${BLANKET_RULE}`)) return false;
  }
  return exitCodeForDiff(diff) === 0 || allowIncrease;
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
  if (result.error) return { error: result.error.message, status: 1 };
  if (result.status !== 0 && result.status !== 1) {
    const detail = result.stderr?.trim() || `eslint failed with exit code ${result.status}.`;
    return { error: detail, status: result.status ?? 1 };
  }
  try {
    return { report: JSON.parse(result.stdout) };
  } catch {
    return { error: result.stderr?.trim() || "eslint did not return JSON.", status: 1 };
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

function printLowered(diff) {
  for (const item of diff.lowered) {
    console.error(`dropped ${item.finding} (${item.from} -> ${item.count})`);
  }
}

function reportDiff(diff, details) {
  if (diff.added.length > 0 || diff.raised.length > 0) {
    console.error("Lint findings rose above the baseline.");
    printNewFindings(diff.added, details, "new");
    printNewFindings(diff.raised, details, "rose");
  }
  if (diff.lowered.length > 0) {
    printLowered(diff);
    console.error(LOWER_BASELINE_MESSAGE);
  }
}

export function main(argv = process.argv) {
  const write = argv.includes("--write");
  const allowIncrease = argv.includes("--allow-increase");
  const lint = runEslint();
  if (lint.error) {
    console.error(lint.error);
    return lint.status ?? 1;
  }

  const blankets = scanBlanketDisables(root, filesFromReport(lint.report));
  const { counts, details } = collectFindings(lint.report, root);
  addBlanketFindings(counts, details, blankets.hits);
  addParseErrors(counts, details, blankets.parseErrors);
  const current = totals(counts);
  const entries = sortedEntries(counts);
  const loaded = readBaselineFile(baselinePath);
  if (loaded.error && !(write && loaded.error.includes("missing"))) {
    console.error(loaded.error);
    return 1;
  }

  const previous = loaded.entries ?? [];
  const diff = diffFindings(previous, counts);
  const base = totals(new Map(previous));
  console.log(
    `eslint: ${current.errors} errors, ${current.warnings} warnings (baseline ${base.errors} errors, ${base.warnings} warnings)`,
  );

  if (write) {
    if (hasBlanketFinding(counts)) {
      console.error("Refusing to record blanket eslint-disable entries in the baseline.");
      printNewFindings(diff.added, details, "new");
      printNewFindings(diff.raised, details, "rose");
      return 1;
    }
    if (!allowsBaselineWrite(diff, allowIncrease)) {
      console.error("Refusing to add or raise baseline entries without --allow-increase.");
      printNewFindings(diff.added, details, "new");
      printNewFindings(diff.raised, details, "rose");
      return 1;
    }
    writeBaseline(entries);
    console.log(
      `Wrote eslint-baseline.json: ${current.errors} errors, ${current.warnings} warnings, ${entries.length} findings.`,
    );
    if (diff.lowered.length > 0) printLowered(diff);
    return 0;
  }

  reportDiff(diff, details);
  return exitCodeForDiff(diff);
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entryPath === import.meta.url) process.exit(main());
