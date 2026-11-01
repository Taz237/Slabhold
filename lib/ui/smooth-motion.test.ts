import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("smooth motion wiring", () => {
  it("wraps each page in a view transition with a still header and tab bar", () => {
    const shell = read("components/app-shell.tsx");
    assert.match(shell, /<ViewTransition key=\{pathname\} enter="page-in" exit="page-out" default="none">/);
    assert.match(shell, /<PageFrame pathname=\{pathname\}/);
    assert.match(shell, /<main\s+data-page=""/);
    assert.match(shell, /viewTransitionName: "app-header"/);
    assert.match(shell, /viewTransitionName: "app-nav"/);
    assert.match(shell, /<NavMotion \/>/);
  });

  it("slides pushed screens, fades tabs, and turns it all off for reduced motion", () => {
    const css = read("app/globals.css");
    for (const rule of [
      'html[data-nav="forward"]::view-transition-group(.page-in)',
      'html[data-nav="back"]::view-transition-group(.page-out)',
      'html[data-nav="none"]::view-transition-old(.page-out)',
      "::view-transition-new(.page-in)",
      "::view-transition {\n  pointer-events: none;",
    ]) {
      assert.ok(css.includes(rule), rule);
    }
    const motion = css.slice(css.indexOf("@keyframes page-fade"));
    const reduced = motion.slice(motion.indexOf("@media (prefers-reduced-motion: reduce)"));
    assert.match(reduced, /::view-transition-group\(\.page-in\)/);
    assert.match(reduced, /animation: none/);
    // Slides move with translate/opacity only, never layout properties.
    const keyframes = motion.slice(motion.indexOf("@keyframes page-from-right"), motion.indexOf("@media"));
    assert.doesNotMatch(keyframes, /\b(left|top|width|height|margin)\s*:/);
  });

  it("removes the tap delay and gives presses a quick scale", () => {
    const css = read("app/globals.css");
    assert.match(css, /html \{\s*touch-action: manipulation;/);
    assert.match(css, /\.tap:active \{\s*scale: 0\.97;/);
    assert.match(read("components/tweet.tsx"), /tap-row/);
    assert.match(read("components/avatar.tsx"), /`tap /);
  });

  it("keeps the standalone swipe and scroll memory in one place", () => {
    const motion = read("components/nav-motion.tsx");
    assert.match(motion, /scrollRestoration = "manual"/);
    assert.match(motion, /display-mode: standalone/);
    assert.match(motion, /addEventListener\("touchstart", onTouchStart, \{ passive: true \}\)/);
    assert.match(motion, /requestAnimationFrame\(paint\)/);
    const paint = motion.slice(motion.indexOf("function paint()"), motion.indexOf("function schedule()"));
    assert.match(paint, /translate3d/);
    assert.doesNotMatch(paint, /style\.(left|top|width|marginLeft)\s*=/);
  });

  it("refreshes without emptying the list and remembers timelines for Back", () => {
    const hook = read("components/use-paged-timeline.ts");
    assert.match(hook, /mergeFreshPage\(existing, next, postIdOf\)/);
    assert.match(hook, /fetchFreshHead\(\{/);
    assert.match(hook, /recall\(memoryKey\)/);
    const feed = read("components/feed-view.tsx");
    assert.match(feed, /onRefresh=\{refreshFeeds\}/);
    const pull = read("components/pull-to-refresh.tsx");
    assert.match(pull, /rubberBand\(deltaY\)/);
    assert.match(pull, /overscrollBehaviorY = "contain"/);
    assert.match(pull, /navigator\.vibrate/);
    assert.doesNotMatch(pull, /style=\{\{ height/);
  });

  it("sends a DM optimistically and brings the draft back on failure", () => {
    const thread = read("components/message-thread.tsx");
    const submit = thread.slice(thread.indexOf("async function submit"), thread.indexOf("const offerBlocked"));
    assert.ok(submit.indexOf("setOutbox((list) => [...list, outgoing])") < submit.indexOf("await sendMessage("));
    assert.match(submit, /setDraft\(\(current\) => current \|\| text\)/);
  });

  it("slides back from every back arrow", () => {
    for (const file of [
      "components/follow-list.tsx",
      "components/card-posts-list.tsx",
      "components/card-detail-shell.tsx",
      "components/public-card-view.tsx",
      "components/message-thread.tsx",
    ]) {
      assert.match(read(file), /data-nav-back=""/, file);
    }
    assert.match(read("components/post-view.tsx"), /goBackWithMotion\(\(\) => router\.back\(\)\)/);
    assert.match(read("app/globals.css"), /::view-transition-group\(page-back-old\)/);
  });
});
