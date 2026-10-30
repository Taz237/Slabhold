import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { gzipSync } from "node:zlib";
import { GUARDED_ROUTES, TOLERANCE, firstLoadGzip, overBudget } from "./check-bundle-size.mjs";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("bundle size check", () => {
  it("gzips each first-load chunk of the route", () => {
    const chunks: Record<string, Buffer> = {
      "a.js": Buffer.from("console.log('a');".repeat(50)),
      "b.js": Buffer.from("console.log('b');".repeat(10)),
    };
    const stats = [
      { route: "/", firstLoadChunkPaths: ["a.js", "b.js"] },
      { route: "/x", firstLoadChunkPaths: ["b.js"] },
    ];
    const expected = gzipSync(chunks["a.js"], { level: 9 }).length + gzipSync(chunks["b.js"], { level: 9 }).length;
    assert.equal(firstLoadGzip(stats, "/", (path: string) => chunks[path]), expected);
    assert.throws(() => firstLoadGzip(stats, "/missing", (path: string) => chunks[path]), /No bundle stats/);
  });

  it("fails a route more than 10% over its baseline", () => {
    assert.equal(TOLERANCE, 0.1);
    assert.deepEqual(overBudget({ "/": 1100 }, { "/": 1000 }), []);
    assert.deepEqual(overBudget({ "/": 1101 }, { "/": 1000 }), [
      { route: "/", actual: 1101, baseline: 1000, limit: 1100 },
    ]);
    assert.deepEqual(overBudget({ "/": 900 }, { "/": 1000 }), []);
  });

  it("fails a guarded route with no baseline", () => {
    assert.deepEqual(overBudget({ "/": 10 }, {}), [{ route: "/", actual: 10, baseline: null, limit: 0 }]);
  });

  it("guards signed-out Home against its recorded baseline, in CI after the build", () => {
    assert.deepEqual(GUARDED_ROUTES, ["/"]);
    const baseline = JSON.parse(read("bundle-baseline.json")) as Record<string, number>;
    assert.ok(Number.isInteger(baseline["/"]) && baseline["/"] > 0, String(baseline["/"]));
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    assert.equal(pkg.scripts["bundle:check"], "node scripts/check-bundle-size.mjs");
    const ci = read(".github/workflows/ci.yml");
    assert.ok(ci.indexOf("npm run bundle:check") > ci.indexOf("npm run build"));
  });
});
