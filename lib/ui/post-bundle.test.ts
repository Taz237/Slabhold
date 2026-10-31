import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Static (non-type) imports of a module, by specifier. */
function staticImports(source: string): string[] {
  return [...source.matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gm)].map((match) => match[1]);
}

describe("post page bundle", () => {
  it("loads supabase-js after hydration in the post view and the reply composer", () => {
    for (const path of ["components/post-view.tsx", "components/mention-textarea.tsx"]) {
      const imports = staticImports(read(path));
      assert.ok(!imports.includes("@/lib/supabase/browser"), path);
      assert.ok(!imports.includes("@supabase/supabase-js"), path);
      assert.ok(!imports.includes("@supabase/ssr"), path);
      assert.ok(imports.includes("@/lib/supabase/browser-lazy"), path);
    }
  });

  it("fetches the server mention search on demand, not with the first load", () => {
    const textarea = read("components/mention-textarea.tsx");
    assert.ok(!staticImports(textarea).includes("@/lib/social/remote"));
    assert.match(textarea, /import\("@\/lib\/social\/remote"\)/);
  });
});
