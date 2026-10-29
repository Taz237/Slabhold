import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { withFollowEdge } from "./follow-edge";

const AT = "2026-10-29T12:00:00.000Z";

describe("optimistic follow", () => {
  it("adds and removes only the viewer's edge", () => {
    const others = [{ followerId: "sam", followingId: "ada", createdAt: AT }];
    const on = withFollowEdge(others, "me", "ada", true, AT);
    assert.deepEqual(on, [...others, { followerId: "me", followingId: "ada", createdAt: AT }]);
    assert.deepEqual(withFollowEdge(on, "me", "ada", false, AT), others);
    assert.deepEqual(withFollowEdge(on, "me", "ada", true, "later"), on, "no duplicate edge");
  });

  it("paints the follow before the server answers and rolls it back on error", () => {
    const provider = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    const toggle = provider.slice(
      provider.indexOf("const toggleFollow = useCallback"),
      provider.indexOf("const followMany = useCallback"),
    );
    const paint = toggle.indexOf("paintFollow(!following)");
    const remote = toggle.indexOf("remoteToggleFollow(");
    assert.ok(paint > -1 && remote > paint, "paints before the request");
    assert.match(toggle, /if \(result\.error\) \{\s*paintFollow\(following\);/);
    assert.match(toggle, /catch \(error\) \{\s*if \(!saved\) paintFollow\(following\);/);
  });
});
