import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { outlineButton, solidButton } from "@/components/button-styles";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const css = read("app/globals.css");

describe("every button shows a press", () => {
  it("dims any button on pointerdown unless it has its own press style", () => {
    assert.match(css, /button\[data-pressed\]:not\(\.tap, \.tap-row, \.tap-fade\) \{\s*opacity: 0\.7;/);
  });

  it("gives the shared solid and outline buttons the shrink press", () => {
    assert.match(solidButton, /(^| )tap( |$)/);
    assert.match(outlineButton, /(^| )tap( |$)/);
  });

  it("does not tint a post row while a button or link inside it is pressed", () => {
    assert.match(css, /\.tap-row:active:not\(:has\(button:active, a:active\)\) \{/);
  });

  it("tints notification and leaderboard rows like post rows", () => {
    assert.match(read("components/notifications-view.tsx"), /className="tap-row /);
    assert.match(read("components/value-board.tsx"), /className="tap-row /);
  });
});

describe("repost", () => {
  it("ticks like a like does and bounces at once", () => {
    const tweet = read("components/tweet.tsx");
    assert.match(tweet, /if \(!reposted\) haptic\("like"\);\s*toggleRepost\(targetId\);/);
  });

  it("puts the repost back the way it was when the server says no", () => {
    const provider = read("components/social-provider.tsx");
    assert.match(provider, /const undoRepost = \(\) => \{/);
    assert.equal((provider.match(/undoRepost\(\);/g) ?? []).length, 2);
  });
});
