import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  LOWER_BASELINE_MESSAGE,
  collectFindings,
  diffFindings,
  findingKey,
  parseBaseline,
  readBaselineFile,
  totals,
} from "./check-lint-baseline.mjs";

const root = "/repo";

describe("lint baseline findings", () => {
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
});
