import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const form = readFileSync(join(process.cwd(), "components/card-form.tsx"), "utf8");
const shareToFeed = readFileSync(join(process.cwd(), "lib/social/share-to-feed.ts"), "utf8");

describe("card caption over 280", () => {
  it("is over only for a new card with Share to feed on", () => {
    assert.match(
      form,
      /const captionOver =\s*!existing && shareToFeedControl\(\{ isPublic: share, share: shareToFeed \}\)\.checked && caption\.length > POST_LIMIT;/,
    );
  });

  it("disables all three submit buttons and stops submit()", () => {
    assert.match(form, /const holdSave = captionOver \? \{ disabled: true \} : undefined;/);
    // The spread comes right after `disabled`, so it wins over the saving/photo state.
    assert.equal((form.match(/disabled=\{saving \|\| readingPhoto\}\s*\{\.\.\.holdSave\}/g) ?? []).length, 3);
    assert.match(form, /async function submit\(\) \{\s*if \(captionOver\) return;/);
  });

  it("holds the guided flow's Add to collection too", () => {
    assert.match(form, /readingPhoto=\{readingPhoto \|\| captionOver\}/);
    const flow = readFileSync(join(process.cwd(), "components/add-card/add-card-flow.tsx"), "utf8");
    // The flow reads readingPhoto only to disable its submit button.
    assert.equal((flow.match(/readingPhoto/g) ?? []).length, 6);
    assert.match(flow, /disabled=\{saving \|\| readingPhoto\}/);
  });

  it("says why under the ring, without role=alert", () => {
    const at = form.indexOf("Caption is over 280. Shorten it or turn off Share to feed.");
    assert.ok(at > 0);
    const near = form.slice(form.indexOf("<CharacterRing length={caption.length}"), at + 80);
    assert.match(near, /text-rose-600/);
    assert.doesNotMatch(near, /role="alert"/);
  });

  it("keeps the share-to-feed slice as a backstop", () => {
    assert.match(shareToFeed, /\.slice\(0, POST_LIMIT\)/);
  });
});
