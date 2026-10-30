import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runSignOutHook, setSignOutHook } from "@/lib/auth/sign-out-hook";
import { emitSocialAction, onSocialAction, type SocialAction } from "@/lib/social/action-signal";

describe("social action signals and the sign-out hook", () => {
  it("queues actions until the push code listens, then delivers live", () => {
    emitSocialAction("follow");
    emitSocialAction("like");
    const seen: SocialAction[] = [];
    const stop = onSocialAction((action) => seen.push(action));
    assert.deepEqual(seen, ["follow", "like"]);
    emitSocialAction("dm");
    assert.deepEqual(seen, ["follow", "like", "dm"]);
    stop();
    emitSocialAction("post");
    assert.deepEqual(seen, ["follow", "like", "dm"]);
    onSocialAction(() => {})();
  });

  it("never lets a listener error escape", () => {
    const stop = onSocialAction(() => {
      throw new Error("boom");
    });
    assert.doesNotThrow(() => emitSocialAction("like"));
    stop();
  });

  it("bounds the sign-out hook so logging out never hangs", async () => {
    setSignOutHook(() => new Promise(() => {}));
    const started = Date.now();
    await runSignOutHook(30);
    assert.ok(Date.now() - started < 500);
    let ran = false;
    setSignOutHook(async () => {
      ran = true;
    });
    await runSignOutHook();
    assert.equal(ran, true);
    setSignOutHook(null);
  });
});
