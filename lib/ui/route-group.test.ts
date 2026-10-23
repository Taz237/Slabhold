import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it } from "node:test";

/**
 * App pages live in app/(app)/ so they get AppChrome (providers + shell).
 * A page, layout, loading or error file anywhere else under app/ renders
 * without the shell. Held PRs written before the move will add files at the
 * old paths; this fails until they are moved into app/(app)/ on rebase.
 */
const ROUTE_FILE = /^(page|layout|loading|error)\.(tsx|ts|jsx|js)$/;

/**
 * Allowed outside app/(app)/. Next only picks up global-error at the app root;
 * it replaces the root layout when that layout itself throws.
 */
function allowed(path: string) {
  if (path === "app/layout.tsx" || path === "app/not-found.tsx" || path === "app/global-error.tsx") return true;
  return ["app/welcome/", "app/api/", "app/auth/"].some((prefix) => path.startsWith(prefix));
}

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(relative(process.cwd(), full).split(sep).join("/"));
  }
  return out;
}

describe("app route group", () => {
  it("keeps every page, layout, loading and error file inside app/(app)/", () => {
    const stray = walk(join(process.cwd(), "app")).filter(
      (path) =>
        !path.startsWith("app/(app)/") && ROUTE_FILE.test(path.slice(path.lastIndexOf("/") + 1)) && !allowed(path),
    );
    assert.deepEqual(stray, [], `Move these into app/(app)/: ${stray.join(", ")}`);
  });

  it("allows only share-image re-exports beside the group", () => {
    const outside = walk(join(process.cwd(), "app")).filter(
      (path) => !path.startsWith("app/(app)/") && !allowed(path) && /\.(tsx|ts|jsx|js)$/.test(path),
    );
    const other = outside.filter(
      (path) => !/\/(opengraph-image|twitter-image)\.tsx$/.test(path) && path !== "app/manifest.ts",
    );
    assert.deepEqual(other, [], `Unexpected route files outside app/(app)/: ${other.join(", ")}`);
  });

  it("catches a held PR's file at its old path", () => {
    for (const path of ["app/error.tsx", "app/leaderboard/value/page.tsx", "app/p/[player]/loading.tsx"]) {
      assert.equal(!path.startsWith("app/(app)/") && !allowed(path), true, path);
    }
  });
});
