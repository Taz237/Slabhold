import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BLANKET_RULE,
  LOWER_BASELINE_MESSAGE,
  PARSE_ERROR_RULE,
  addBlanketFindings,
  addParseErrors,
  allowsBaselineWrite,
  collectFindings,
  diffFindings,
  exitCodeForDiff,
  findBlanketDisables,
  findingKey,
  main,
  parseBaseline,
  readBaselineFile,
  scanBlanketDisables,
  totals,
} from "./check-lint-baseline.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const root = "/repo";

function committedBaseline(): Array<[string, number]> {
  const baseline = readBaselineFile(join(repoRoot, "eslint-baseline.json"));
  assert.equal(baseline.error, undefined);
  return baseline.entries as Array<[string, number]>;
}

function exitForBlanketFile(fileName: string, source: string) {
  const dir = mkdtempSync(join(tmpdir(), "blanket-"));
  const file = join(dir, fileName);
  writeFileSync(file, source);
  const scanned = scanBlanketDisables(dir, [file]);
  assert.deepEqual(scanned.parseErrors, []);
  const finding = findingKey("error", fileName, BLANKET_RULE);
  const entries = committedBaseline();
  const counts = new Map<string, number>(entries);
  const details = new Map<string, string[]>();
  addBlanketFindings(counts, details, scanned.hits);
  const diff = diffFindings(entries, counts);
  assert.equal(exitCodeForDiff(diff), 1);
  assert.deepEqual(
    diff.added.filter((item) => item.finding === finding),
    [{ finding, count: scanned.hits.length }],
  );
  assert.match(details.get(finding)?.join("\n") ?? "", /blanket-disable/);
  return scanned.hits;
}

describe("lint baseline findings", { concurrency: false }, () => {
  it("counts severity file:rule and ignores line and column", () => {
    const { counts } = collectFindings(
      [
        {
          filePath: "/repo/lib/a.ts",
          messages: [
            { severity: 2, ruleId: "no-unused-vars", line: 1, column: 1, message: "x" },
            { severity: 2, ruleId: "no-unused-vars", line: 9, column: 4, message: "y" },
            { severity: 1, ruleId: "@typescript-eslint/no-explicit-any", line: 3, column: 2, message: "z" },
          ],
        },
      ],
      root,
    );
    assert.equal(counts.get(findingKey("error", "lib/a.ts", "no-unused-vars")), 2);
    assert.equal(counts.get(findingKey("warning", "lib/a.ts", "@typescript-eslint/no-explicit-any")), 1);
    assert.deepEqual(totals(counts), { errors: 2, warnings: 1 });
  });

  it("fails when a count rises or a new entry appears, and only warns when findings disappear", () => {
    const baseline: Array<[string, number]> = [
      ["error lib/a.ts:no-unused-vars", 2],
      ["warning lib/b.ts:no-console", 1],
    ];
    const same = new Map<string, number>(baseline);
    assert.deepEqual(diffFindings(baseline, same), { raised: [], added: [], lowered: [] });

    const rose = new Map<string, number>([
      ["error lib/a.ts:no-unused-vars", 3],
      ["warning lib/b.ts:no-console", 1],
    ]);
    assert.equal(diffFindings(baseline, rose).raised.length, 1);

    const added = new Map<string, number>([
      ["error lib/a.ts:no-unused-vars", 2],
      ["error lib/c.ts:eqeqeq", 1],
      ["warning lib/b.ts:no-console", 1],
    ]);
    assert.deepEqual(diffFindings(baseline, added).added, [{ finding: "error lib/c.ts:eqeqeq", count: 1 }]);

    const dropped = new Map<string, number>([["error lib/a.ts:no-unused-vars", 1]]);
    const lowered = diffFindings(baseline, dropped).lowered;
    assert.equal(lowered.length, 2);
    assert.equal(LOWER_BASELINE_MESSAGE, "lower the baseline: run npm run lint:baseline");
  });

  it("rejects a missing or malformed baseline", () => {
    const dir = mkdtempSync(join(tmpdir(), "lint-baseline-"));
    assert.match(readBaselineFile(join(dir, "missing.json")).error ?? "", /missing/);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{");
    assert.match(readBaselineFile(bad).error ?? "", /malformed/);
    assert.match(parseBaseline({ errors: 32, warnings: 13 }).error ?? "", /malformed/);
    assert.match(parseBaseline(["error lib/a.ts:no-unused-vars"]).error ?? "", /malformed/);
    assert.match(parseBaseline({ "error lib/a.ts:no-unused-vars": 0 }).error ?? "", /malformed/);
    assert.deepEqual(parseBaseline({ "warning lib/a.ts:no-console": 2 }).entries, [
      ["warning lib/a.ts:no-console", 2],
    ]);
  });

  it("flags a new file with a blanket disable and an any", () => {
    const dir = mkdtempSync(join(tmpdir(), "blanket-new-"));
    const file = join(dir, "new-file.ts");
    const source = "/* eslint-disable */\nexport const value: any = 1;\n";
    writeFileSync(file, source);
    const hits = findBlanketDisables(readFileSync(file, "utf8"));
    assert.equal(hits.length, 1);
    const finding = findingKey("error", "scripts/new-file.ts", BLANKET_RULE);
    const entries = committedBaseline();
    const counts = new Map<string, number>(entries);
    const details = new Map<string, string[]>();
    addBlanketFindings(counts, details, [{ file: "scripts/new-file.ts", line: hits[0].line, column: hits[0].column }]);
    const diff = diffFindings(entries, counts);
    assert.equal(exitCodeForDiff(diff), 1);
    assert.deepEqual(diff.added, [{ finding, count: 1 }]);
    assert.match(details.get(finding)?.join("\n") ?? "", /blanket-disable/);
  });

  it("flags an existing file when a blanket disable is added", () => {
    const rel = "lib/format.ts";
    const original = readFileSync(join(repoRoot, rel), "utf8");
    assert.equal(findBlanketDisables(original).length, 0);
    const source = `// eslint-disable-next-line\n${original}`;
    const hits = findBlanketDisables(source);
    assert.equal(hits.length, 1);
    const finding = findingKey("error", rel, BLANKET_RULE);
    const entries = committedBaseline();
    const counts = new Map<string, number>(entries);
    addBlanketFindings(counts, new Map(), [{ file: rel, line: hits[0].line, column: hits[0].column }]);
    const diff = diffFindings(entries, counts);
    assert.equal(exitCodeForDiff(diff), 1);
    assert.equal(diff.added.some((item) => item.finding === finding), true);
  });

  it("ignores disables that name a rule and disables written inside strings", () => {
    const ruled = [
      "// eslint-disable-next-line @next/next/no-img-element\n",
      "/* eslint-disable no-alert, no-console */\n",
      "{/* eslint-disable-next-line @next/next/no-img-element */}\n",
      "const sample = \"/* eslint-disable */\";\n",
      "const line = '// eslint-disable-next-line';\n",
    ].join("");
    assert.deepEqual(findBlanketDisables(ruled), []);
    assert.equal(findBlanketDisables("// eslint-disable-line\nconst n = 1;\n").length, 1);
  });

  it("refuses to add or raise baseline entries unless --allow-increase is passed", () => {
    const added = { added: [{ finding: "error lib/a.ts:no-unused-vars", count: 1 }], raised: [], lowered: [] };
    const raised = {
      added: [],
      raised: [{ finding: "error lib/a.ts:no-unused-vars", from: 1, count: 2 }],
      lowered: [],
    };
    const lowered = {
      added: [],
      raised: [],
      lowered: [{ finding: "error lib/a.ts:no-unused-vars", from: 2, count: 1 }],
    };
    const blanket = {
      added: [{ finding: "error lib/a.ts:(blanket-disable)", count: 1 }],
      raised: [],
      lowered: [],
    };
    assert.equal(allowsBaselineWrite(added, false), false);
    assert.equal(allowsBaselineWrite(raised, false), false);
    assert.equal(allowsBaselineWrite(added, true), true);
    assert.equal(allowsBaselineWrite(lowered, false), true);
    assert.equal(allowsBaselineWrite(blanket, true), false);
  });

  it("flags a blanket disable after a regex quote and empty quoted rule lists", () => {
    const sources = [
      'const re = /"/;\n/* eslint-disable */\nexport const n = 1;\n',
      "const re = /'/;\n// eslint-disable-next-line\nexport const n = 1;\n",
      '/* eslint-disable "" */\nexport const n = 1;\n',
      "/* eslint-disable '' */\nexport const n = 1;\n",
    ];
    for (const source of sources) {
      const hits = exitForBlanketFile("sample.ts", source);
      assert.equal(hits.length, 1);
    }
    assert.equal(findBlanketDisables('/* eslint-disable "no-alert" */\nconst n = 1;\n').length, 0);
    assert.equal(findBlanketDisables("// eslint-disable\nconst n = 1;\n").length, 0);
  });

  it("flags blanket disables in mts, cts, jsx, and cjs files", () => {
    const source = "/* eslint-disable */\nexport const value = 1;\n";
    for (const extension of [".mts", ".cts", ".jsx", ".cjs"]) {
      const hits = exitForBlanketFile(`new-file${extension}`, source);
      assert.equal(hits.length, 1);
      assert.equal(hits[0].line, 1);
    }
  });

  it("reports a parse failure as an error finding and exits 1", () => {
    const dir = mkdtempSync(join(tmpdir(), "blanket-parse-"));
    const file = join(dir, "broken.ts");
    writeFileSync(file, "const = ;\n");
    const scanned = scanBlanketDisables(dir, [file]);
    assert.equal(scanned.parseErrors.length, 1);
    const finding = findingKey("error", "broken.ts", PARSE_ERROR_RULE);
    const entries = committedBaseline();
    const counts = new Map<string, number>(entries);
    addParseErrors(counts, new Map(), scanned.parseErrors);
    const diff = diffFindings(entries, counts);
    assert.equal(exitCodeForDiff(diff), 1);
    assert.deepEqual(diff.added, [{ finding, count: 1 }]);
  });

  it("main exits 0 on this tree", { timeout: 60_000 }, () => {
    assert.equal(main(["node", "scripts/check-lint-baseline.mjs"]), 0);
  });

  it("main exits 1 when a file starts with a blanket disable", { timeout: 60_000 }, () => {
    const file = join(repoRoot, "scripts", "blanket-disable-e2e.ts");
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((arg) => String(arg)).join(" "));
    };
    writeFileSync(file, "/* eslint-disable */\nexport const blanketE2e = 1;\n");
    try {
      assert.equal(main(["node", "scripts/check-lint-baseline.mjs"]), 1);
      assert.match(errors.join("\n"), /scripts\/blanket-disable-e2e\.ts:\(blanket-disable\)/);
    } finally {
      console.error = original;
      rmSync(file, { force: true });
    }
  });
});
