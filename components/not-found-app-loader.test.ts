import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("the root 404's app shell", () => {
  it("loads in two steps, so its chunk list stays off every first load", () => {
    const chrome = read("components/app-chrome-lazy.tsx");
    assert.doesNotMatch(chrome, /import\("@\/components\/not-found-app"\)/);
    assert.match(chrome, /import\("@\/components\/not-found-app-loader"\)/);
    assert.match(read("components/not-found-app-loader.ts"), /import\("@\/components\/not-found-app"\)/);
  });
});
