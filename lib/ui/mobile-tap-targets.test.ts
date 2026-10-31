import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile tap targets", () => {
  it("makes the shared solid button at least 44px tall", () => {
    const styles = read("components/button-styles.ts");
    assert.match(styles, /export const solidButton =\n  "inline-flex min-h-11 /);
  });

  it("gives icon back buttons a 44px hit area without growing the glyph", () => {
    const backs = [
      ["components/post-view.tsx", "Back"],
      ["components/follow-list.tsx", "Back to profile"],
      ["components/privacy-lists.tsx", "Back"],
      ["components/card-posts-list.tsx", "Back to card"],
    ] as const;
    for (const [path, label] of backs) {
      const source = read(path);
      assert.match(source, new RegExp(`aria-label="${label}"`));
      assert.match(source, /hit-44 grid h-9 w-9 place-items-center/);
    }
    // The DM header's back button is a full 44px circle.
    const thread = read("components/message-thread.tsx");
    assert.match(thread, /aria-label="Back to messages"\n\s+className="grid h-11 w-11 /);
  });

  it("keeps collection chips at least 32px with a 44px hit area", () => {
    const dashboard = read("components/dashboard.tsx");
    assert.match(dashboard, /"hit-44 inline-flex h-9 shrink-0 items-center/);
    const hero = read("components/portfolio-hero.tsx");
    assert.match(hero, /hit-44 h-9 rounded-full text-xs font-semibold/);
  });

  it("keeps the header safe-area padding after the status bar change", () => {
    const layout = read("app/layout.tsx");
    assert.match(layout, /statusBarStyle: "default"/);
    assert.match(layout, /viewportFit: "cover"/);
    const shell = read("components/app-shell.tsx");
    assert.match(
      shell,
      /pt-\[env\(safe-area-inset-top\)\]/,
    );
    assert.match(shell, /env\(safe-area-inset-bottom\)/);
  });
});
