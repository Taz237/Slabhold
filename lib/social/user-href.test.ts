import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { userHref } from "./user-href";

const ROOTS = ["app", "components", "lib"];
const rawTemplate = /\/(?:u|messages)\/\$\{(?!userHref\()/;
const rawConcat = /"\/(?:u|messages)\/"\s*\+/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    if (entry.name === "user-href.ts") continue;
    out.push(path);
  }
  return out;
}

describe("userHref", () => {
  it("encodes a username as one profile or message path segment", () => {
    assert.equal(userHref("ada"), "/u/ada");
    assert.equal(userHref("@ada"), "/u/ada");
    assert.equal(userHref("  ada  "), "/u/ada");
    assert.equal(userHref("a/b?c#d", "messages"), "/messages/a%2Fb%3Fc%23d");
    assert.equal(userHref("a/b?c"), "/u/a%2Fb%3Fc");
  });

  it("builds username links through userHref", () => {
    const files = ROOTS.flatMap((root) => sourceFiles(join(process.cwd(), root)));
    assert.ok(files.length > 0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, rawTemplate, file);
      assert.doesNotMatch(source, rawConcat, file);
    }
  });
});
