import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();

function imageFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...imageFiles(path));
    else if (entry.name === "opengraph-image.tsx" || entry.name === "twitter-image.tsx") found.push(path);
  }
  return found;
}

describe("share image addresses", () => {
  it("keeps every app share image at its original address", () => {
    // Next suffixes metadata routes inside a route group (app/(app)), so each
    // keeps a re-export at its old path for shared links and built paths.
    const inGroup = imageFiles(join(root, "app", "(app)"));
    assert.ok(inGroup.length >= 20);
    for (const file of inGroup) {
      const rel = relative(join(root, "app", "(app)"), file);
      const compat = join(root, "app", rel);
      assert.ok(existsSync(compat), rel);
      const source = readFileSync(compat, "utf8");
      assert.match(source, new RegExp(`from "@/app/\\(app\\)/${rel.replace(/\.tsx$/, "").replace(/[[\]]/g, "\\$&")}"`), rel);
      assert.match(source, /export \{ default, alt, size, contentType \}/, rel);
      const original = readFileSync(file, "utf8");
      for (const config of original.match(/^export const (runtime|dynamic|revalidate) = .*$/gm) ?? []) {
        assert.ok(source.includes(config), `${rel}: ${config}`);
      }
    }
  });

  it("builds share image paths that the compat routes serve", () => {
    assert.ok(existsSync(join(root, "app/cards/[id]/opengraph-image.tsx")));
    assert.ok(existsSync(join(root, "app/u/[username]/cards/[id]/opengraph-image.tsx")));
    assert.ok(existsSync(join(root, "app/u/[username]/collection/opengraph-image.tsx")));
  });
});
