import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { failedReplyParents } from "@/components/profile-view";

const source = readFileSync(join(process.cwd(), "components/profile-view.tsx"), "utf8");

describe("profile Replies when supabase-js fails to load", () => {
  it("settles to the current key with no parents visible", async () => {
    const key = "r1:p1|r2:p2";
    let replyParents: { key: string; ids: ReadonlySet<string> } | null = null;
    const load = () => Promise.reject(new Error("Failed to fetch dynamically imported module"));
    await load()
      .then(() => {})
      .catch(() => {
        replyParents = failedReplyParents(key);
      });
    assert.ok(replyParents);
    const settled = replyParents as { key: string; ids: ReadonlySet<string> };
    assert.equal(settled.key, key);
    assert.equal(settled.ids.size, 0);
    // The same check ProfileView uses for replyParentsReady.
    assert.equal(settled.key === key, true);
  });

  it("is what the reply-parent chain's catch sets", () => {
    const start = source.indexOf("void visibleReplyParentIds(supabase, ids)");
    assert.ok(start > 0);
    const tail = source.slice(start, source.indexOf("return () => {", start));
    assert.match(tail, /\}\)\.catch\(\(\) => \{[\s\S]*if \(!cancelled\) setReplyParents\(failedReplyParents\(replyParentKey\)\);/);
  });
});
