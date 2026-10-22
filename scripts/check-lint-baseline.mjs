/**
 * Compare ESLint findings to eslint-baseline.json.
 *
 * Each entry is "severity file:rule" with a count. Line and column are ignored.
 * Exit 1 when a count rises, a new entry appears, a blanket eslint-disable names
 * no rule, ESLint crashes, or the baseline is missing or malformed. A drop is not
 * a failure: print LOWER_BASELINE_MESSAGE.
 *
 * `node scripts/check-lint-baseline.mjs --write` rewrites the baseline when counts
 * only stay the same or fall. Adding or raising entries requires `--allow-increase`.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LOWER_BASELINE_MESSAGE = "lower the baseline: run npm run lint:baseline";
export const BLANKET_RULE = "(blanket-disable)";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);

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

function namesNoRule(tail) {
  const description = tail.indexOf("--");
  const rules = (description === -1 ? tail : tail.slice(0, description)).trim();
  if (!rules) return true;
  return rules.split(",").map((part) => part.trim()).filter(Boolean).length === 0;
}

function blanketDirective(kind, body) {
  const match = /^\s*(?:\*\s*)?(eslint-disable-next-line|eslint-disable-line|eslint-disable)(?![\w-])([\s\S]*)$/.exec(body);
  if (!match) return false;
  if (kind === "line" && match[1] === "eslint-disable") return false;
  return namesNoRule(match[2]);
}

export function findBlanketDisables(source) {
  const hits = [];
  const length = source.length;
  let index = 0;
  let line = 1;
  let column = 1;

  function bump(count) {
    for (let step = 0; step < count; step += 1) {
      if (source[index + step] === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
    }
    index += count;
  }

  function skipString(quote) {
    bump(1);
    while (index < length) {
      if (source[index] === "\\") {
        bump(Math.min(2, length - index));
        continue;
      }
      if (quote === "`" && source[index] === "$" && source[index + 1] === "{") {
        bump(2);
        skipTemplateExpression();
        continue;
      }
      if (source[index] === quote) {
        bump(1);
        return;
      }
      bump(1);
    }
  }

  function skipTemplateExpression() {
    let depth = 1;
    while (index < length && depth > 0) {
      const current = source[index];
      const next = source[index + 1];
      if (current === "'" || current === '"' || current === "`") {
        skipString(current);
        continue;
      }
      if (current === "/" && next === "/") {
        const startLine = line;
        const startColumn = column;
        bump(2);
        let body = "";
        while (index < length && source[index] !== "\n") {
          body += source[index];
          bump(1);
        }
        if (blanketDirective("line", body)) hits.push({ line: startLine, column: startColumn });
        continue;
      }
      if (current === "/" && next === "*") {
        readBlock();
        continue;
      }
      if (current === "{") depth += 1;
      else if (current === "}") depth -= 1;
      bump(1);
    }
  }

  function readBlock() {
    const startLine = line;
    const startColumn = column;
    bump(2);
    let body = "";
    while (index + 1 < length && !(source[index] === "*" && source[index + 1] === "/")) {
      body += source[index];
      bump(1);
    }
    if (index + 1 < length) bump(2);
    if (blanketDirective("block", body)) hits.push({ line: startLine, column: startColumn });
  }

  while (index < length) {
    const current = source[index];
    const next = source[index + 1];
    if (current === "'" || current === '"' || current === "`") {
      skipString(current);
      continue;
    }
    if (current === "/" && next === "/") {
      const startLine = line;
      const startColumn = column;
      bump(2);
      let body = "";
      while (index < length && source[index] !== "\n") {
        body += source[index];
        bump(1);
      }
      if (blanketDirective("line", body)) hits.push({ line: startLine, column: startColumn });
      continue;
    }
    if (current === "/" && next === "*") {
      readBlock();
      continue;
    }
    bump(1);
  }

  return hits;
}

export function trackedSourceFiles(rootDir) {
  const listed = spawnSync("git", ["ls-files", "-z"], {
    cwd: rootDir,
    encoding: "buffer",
  });
  if (listed.status !== 0) {
    const stderr = listed.stderr ? listed.stderr.toString("utf8") : "";
    return { error: stderr || "git ls-files failed." };
  }
  const files = listed.stdout
    .toString("utf8")
    .split("\0")
    .filter((file) => {
      if (!file || !SOURCE_EXTENSIONS.has(extname(file))) return false;
      return !file.split("/").includes("node_modules") && !file.split("/").includes(".next");
    });
  return { files };
}

export function scanBlanketDisables(rootDir, files) {
  const hits = [];
  for (const file of files) {
    let source;
    try {
      source = readFileSync(join(rootDir, file), "utf8");
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
    for (const hit of findBlanketDisables(source)) {
      hits.push({ file, line: hit.line, column: hit.column });
    }
  }
  return { hits };
}

export function addBlanketFindings(counts, details, hits) {
  for (const hit of hits) {
    const finding = findingKey("error", hit.file, BLANKET_RULE);
    counts.set(finding, (counts.get(finding) ?? 0) + 1);
    const detail = `${hit.file}:${hit.line}:${hit.column} error blanket eslint-disable ${BLANKET_RULE}`;
    if (!details.has(finding)) details.set(finding, []);
    details.get(finding).push(detail);
  }
}

export function exitCodeForDiff(diff) {
  return diff.added.length > 0 || diff.raised.length > 0 ? 1 : 0;
}

export function allowsBaselineWrite(diff, allowIncrease) {
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

function reportDiff(diff, details) {
  if (diff.added.length > 0 || diff.raised.length > 0) {
    console.error("Lint findings rose above the baseline.");
    printNewFindings(diff.added, details, "new");
    printNewFindings(diff.raised, details, "rose");
  }
  if (diff.lowered.length > 0) {
    for (const item of diff.lowered) {
      console.error(`dropped ${item.finding} (${item.from} -> ${item.count})`);
    }
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

  const tracked = trackedSourceFiles(root);
  if (tracked.error) {
    console.error(tracked.error);
    return 1;
  }
  const blankets = scanBlanketDisables(root, tracked.files);
  if (blankets.error) {
    console.error(blankets.error);
    return 1;
  }

  const { counts, details } = collectFindings(lint.report, root);
  addBlanketFindings(counts, details, blankets.hits);
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
    if (diff.lowered.length > 0) console.error(LOWER_BASELINE_MESSAGE);
    return 0;
  }

  reportDiff(diff, details);
  return exitCodeForDiff(diff);
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entryPath === import.meta.url) process.exit(main());
