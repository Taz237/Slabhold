import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

describe("function region", () => {
  it("runs functions in Portland, next to the us-west-2 database", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      regions?: string[];
      crons?: unknown[];
    };
    assert.deepEqual(vercel.regions, ["pdx1"]);
    assert.equal(vercel.crons?.length, 2, "the crons are unchanged");
  });
});
