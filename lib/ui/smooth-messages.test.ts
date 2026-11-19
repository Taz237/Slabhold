import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { THREAD_PIN_SLACK_PX, followsNewMessage, threadAtBottom } from "./thread-height";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("the chat stays pinned to the bottom", () => {
  it("counts the reader as at the bottom within a bubble or two of it", () => {
    assert.equal(threadAtBottom({ scrollTop: 600, scrollHeight: 1200, clientHeight: 600 }), true);
    assert.equal(threadAtBottom({ scrollTop: 600 - THREAD_PIN_SLACK_PX, scrollHeight: 1200, clientHeight: 600 }), true);
    assert.equal(threadAtBottom({ scrollTop: 200, scrollHeight: 1200, clientHeight: 600 }), false);
  });

  it("follows a new message on open, for your own, or when you were at the bottom", () => {
    assert.equal(followsNewMessage({ first: true, pinned: false, own: false }), true);
    assert.equal(followsNewMessage({ first: false, pinned: false, own: true }), true);
    assert.equal(followsNewMessage({ first: false, pinned: true, own: false }), true);
  });

  it("never pulls you down while you read older messages", () => {
    assert.equal(followsNewMessage({ first: false, pinned: false, own: false }), false);
  });

  it("jumps before paint, and re-pins when the keyboard moves or content grows", () => {
    const thread = read("components/message-thread.tsx");
    assert.match(thread, /useLayoutEffect\(\(\) => \{[\s\S]{0,260}?followsNewMessage\(/);
    assert.match(thread, /if \(node && pinned\.current\) node\.scrollTop = node\.scrollHeight;[\s\S]{0,320}?\}, \[keyboardInset, keyboardOpen\]\);/);
    assert.match(thread, /new MutationObserver\(repin\)/);
    assert.match(thread, /new ResizeObserver\(repin\)/);
    assert.match(thread, /addEventListener\("load", repin, true\)/);
  });

  it("puts the page back if iOS scrolled it to reveal the message box", () => {
    assert.match(read("components/message-thread.tsx"), /if \(keyboardOpen && window\.scrollY !== 0\) window\.scrollTo\(0, 0\);/);
  });

  it("still rises new bubbles in, only when motion is allowed", () => {
    assert.match(read("components/message-thread.tsx"), /motion-safe:animate-\[bubble-in/);
  });
});

describe("pull to refresh", () => {
  const pull = read("components/pull-to-refresh.tsx");

  it("spins an arc with a gap, so the turn shows", () => {
    assert.match(pull, /const SPIN_GAP = 0\.28;/);
    assert.match(pull, /ring\.style\.strokeDashoffset = String\(RING \* SPIN_GAP\);/);
  });

  it("snaps instead of sliding with Reduce Motion on", () => {
    assert.match(pull, /animate && !window\.matchMedia\(REDUCED\)\.matches \? SETTLE : "none"/);
  });

  it("refreshes just the inbox on Messages", () => {
    assert.match(read("components/messages-view.tsx"), /<PullToRefresh onRefresh=\{refreshInbox\} className="-mx-4 -mt-5">\s*<div className="flex items-center justify-between/);
  });

  it("is on Home, Notifications, Messages and Profile", () => {
    for (const file of ["components/feed-view.tsx", "components/notifications-view.tsx", "components/messages-view.tsx", "components/profile-view.tsx"]) {
      assert.match(read(file), /<PullToRefresh/, file);
    }
  });
});

describe("Reduce Motion", () => {
  it("turns every smooth scroll into a jump", () => {
    // The tab re-tap scroll in the app shell already does (lib/ui/smooth-nav.test.ts).
    for (const file of [
      "components/feed-view.tsx",
      "components/card-detail.tsx",
      "components/mention-text.tsx",
      "lib/cards/add-form-sections.ts",
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /behavior: "smooth"/, file);
      assert.match(source, /behavior: scrollBehavior\(\)/, file);
    }
  });
});
