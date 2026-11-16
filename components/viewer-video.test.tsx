import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { scrubTime } from "@/components/viewer-video";
import { readVideoFile } from "@/lib/ui/video-poster";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("fullscreen video controls on iPhone", () => {
  it("gives the scrubber, play/pause and mute normal touch back", () => {
    const controls = read("components/viewer-video.tsx");
    assert.match(controls, /const TOUCHABLE: React\.CSSProperties = \{ touchAction: "auto" \};/);
    const scrubber = controls.slice(controls.indexOf("<div data-video-scrubber"));
    assert.match(scrubber.slice(0, 200), /style=\{TOUCHABLE\} className="pointer-events-auto touch-auto/);
    assert.match(scrubber, /type="range"[\s\S]*style=\{TOUCHABLE\}\n\s+className="video-scrubber[^"]*touch-auto/);
    for (const handler of ["onClick={player.toggle}", "onClick={player.toggleMute}"]) {
      const at = controls.indexOf(handler);
      assert.ok(at > 0, handler);
      assert.match(controls.slice(at, at + 260), /style=\{TOUCHABLE\}\n\s+className="[^"]*touch-auto/);
    }
  });

  it("keeps the controls off the swipe stage, so swipe-down still closes, and leaves photos as they were", () => {
    const viewer = read("components/photo-viewer.tsx");
    assert.match(viewer, /className="fixed inset-0 z-\[80\] touch-none overscroll-contain select-none"/);
    const stage = viewer.slice(viewer.indexOf("data-photo-stage"), viewer.indexOf("data-photo-chrome"));
    assert.doesNotMatch(stage, /ViewerVideoControls/);
    const chrome = viewer.slice(viewer.indexOf("data-photo-chrome"));
    assert.match(chrome, /<ViewerVideoControls player=\{player\} placement="center" \/>/);
    assert.match(chrome, /<ViewerVideoControls player=\{player\} placement="bar" \/>/);
    assert.doesNotMatch(viewer, /touch-auto/);
  });

  it("turns a finger's position into a time on the scrubber, clamped to the clip", () => {
    const rect = { left: 40, width: 200 };
    assert.equal(scrubTime(40, rect, 12), 0);
    assert.equal(scrubTime(140, rect, 12), 6);
    assert.equal(scrubTime(240, rect, 12), 12);
    assert.equal(scrubTime(-50, rect, 12), 0);
    assert.equal(scrubTime(900, rect, 12), 12);
    assert.equal(scrubTime(140, { left: 0, width: 0 }, 12), 0);
    assert.equal(scrubTime(140, rect, 0), 0);
  });
});

describe("reading a picked video", () => {
  it("a cancelled pick rejects before making an object URL, so nothing can leak", async () => {
    const original = URL.createObjectURL;
    let made = 0;
    URL.createObjectURL = () => {
      made += 1;
      return "blob:x";
    };
    try {
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(readVideoFile(new Blob([]) as File, controller.signal), { name: "AbortError" });
      assert.equal(made, 0);
    } finally {
      URL.createObjectURL = original;
    }
  });

  it("checks the cancel after every wait and frees the URL on any failure", () => {
    const source = read("lib/ui/video-poster.ts");
    assert.equal(source.match(/stopIfAborted\(signal\);/g)?.length, 6);
    assert.match(source, /catch \(error\) \{\n\s+\/\/ Failed or cancelled[^\n]*\n\s+URL\.revokeObjectURL\(src\);/);
    const hook = read("components/use-video-draft.ts");
    assert.match(hook, /readVideoFile\(file, controller\.signal\)/);
    assert.match(hook, /if \(controller\.signal\.aborted\) \{\n\s+URL\.revokeObjectURL\(read\.src\);\n\s+return;/);
  });
});

describe("home composer draft", () => {
  it("counts a video-only post as a draft", () => {
    assert.match(read("components/feed-view.tsx"), /const hasDraft = [^\n]*\|\| video\.active;/);
  });
});
