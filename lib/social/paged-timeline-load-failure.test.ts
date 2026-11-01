import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const hook = readFileSync(join(process.cwd(), "components/use-paged-timeline.ts"), "utf8");

/** The source from `start` to the next `end`. */
function slice(start: string, end: string) {
  const from = hook.indexOf(start);
  assert.ok(from >= 0, start);
  const to = hook.indexOf(end, from + start.length);
  assert.ok(to > from, end);
  return hook.slice(from, to);
}

describe("timeline when supabase-js fails to load", () => {
  it("ends the first load with an error instead of loading forever", () => {
    const first = slice("if (!current.enabled) return;\n    void loadSupabaseBrowser()", "}, [scopeKey]);");
    // The chain on loadSupabaseBrowser itself ends in a catch that settles the page.
    const outer = first.slice(first.lastIndexOf("})\n      .catch("));
    assert.match(outer, /if \(epochRef\.current !== token\) return;/);
    assert.match(outer, /setPage\(idle\);/);
    assert.match(outer, /setLoading\(false\);/);
    assert.match(outer, /setError\(loadError\(reason\)\);/);
  });

  it("ends a load-more with loadingMore false and an error", () => {
    const more = slice("const loadMore = useCallback(", "}, []);\n\n  /**");
    const outer = more.slice(more.lastIndexOf("})\n      .catch("));
    assert.match(outer, /if \(epochRef\.current !== token\) return;/);
    assert.match(outer, /loadingMoreRef\.current = false;/);
    assert.match(outer, /setLoadingMore\(false\);/);
    assert.match(outer, /setError\(loadError\(reason\)\);/);
  });

  it("loads the client inside the try in refresh and the newer check", () => {
    for (const start of ["const refresh = useCallback(", "const checkNewer = useCallback("]) {
      const body = slice(start, "}, []);");
      const tryAt = body.indexOf("try {");
      const loadAt = body.indexOf("await loadSupabaseBrowser()");
      assert.ok(tryAt > 0 && loadAt > tryAt, start);
    }
  });

  it("never leaves a loadSupabaseBrowser chain without a catch", () => {
    const chains = hook.match(/void loadSupabaseBrowser\(\)\s*\.then/g) ?? [];
    assert.equal(chains.length, 2);
    assert.equal((hook.match(/\}\)\n {6}\.catch\(\(reason: unknown\) => \{/g) ?? []).length, 2);
  });
});
