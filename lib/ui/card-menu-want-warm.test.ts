import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** Static (non-type) imports of a module, by specifier. */
function staticImports(source: string): string[] {
  return [...source.matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gm)].map((match) => match[1]);
}

describe("the Want control's chunk on card pages", () => {
  it("the owner's card page warms the ⋯ menu's Want chunk once the page is idle", () => {
    const detail = read("components/card-detail.tsx");
    assert.match(detail, /^import \{ MenuWantButton as WantButton \} from "@\/components\/menu-want-button";$/m);
    assert.match(detail, /^import \{ afterFirstIdle \} from "@\/lib\/ui\/idle";$/m);
    assert.match(detail, /useEffect\(\(\) => afterFirstIdle\(\(\) => WantButton\.warm\(\)\), \[\]\);/);
    assert.ok(!staticImports(detail).includes("@/components/want-button"), "no static Want import");
  });

  it("the public card keeps Want in the page: a static import, no lazy part", () => {
    const view = read("components/public-card-view.tsx");
    assert.match(view, /^import \{ WantButton \} from "@\/components\/want-button";$/m);
    assert.ok(staticImports(view).includes("@/components/want-button"));
    assert.ok(!staticImports(view).includes("@/components/menu-want-button"));
    assert.doesNotMatch(view, /import\("@\/components\/want-button"\)/);
    assert.doesNotMatch(view, /MenuWantButton|menuWantButton/);
  });
});
