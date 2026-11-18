import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_VIDEO_DRAFT,
  videoDraftActive,
  videoDraftBusy,
  videoDraftPercent,
  videoDraftReducer,
  type VideoDraft,
  type VideoDraftAction,
} from "./video-draft";
import type { PostVideo } from "./videos";

const PREVIEW = { src: "blob:a", poster: "blob:b", width: 1080, height: 1920, duration: 9 };
const VIDEO: PostVideo = {
  url: "https://x.supabase.co/storage/v1/object/public/post-videos/u/v.mov",
  poster: "https://x.supabase.co/storage/v1/object/public/post-videos/u/p.jpg",
  width: 1080,
  height: 1920,
  duration: 9,
  mime: "video/quicktime",
};

function run(actions: VideoDraftAction[], start: VideoDraft = EMPTY_VIDEO_DRAFT): VideoDraft {
  return actions.reduce(videoDraftReducer, start);
}

describe("composer video state", () => {
  it("goes empty, reading, uploading, ready, and Post waits until ready", () => {
    let state = run([{ type: "pick", id: 1 }]);
    assert.equal(state.phase, "reading");
    assert.equal(videoDraftBusy(state), true);
    state = run([{ type: "read", id: 1, preview: PREVIEW }], state);
    assert.equal(state.phase, "uploading");
    assert.equal(videoDraftBusy(state), true);
    state = run([{ type: "progress", id: 1, value: 0.42 }], state);
    assert.equal(videoDraftPercent(state), 42);
    state = run([{ type: "uploaded", id: 1, video: VIDEO }], state);
    assert.equal(state.phase, "ready");
    assert.equal(videoDraftBusy(state), false);
    assert.equal(videoDraftActive(state), true);
    assert.deepEqual(state.video, VIDEO);
  });

  it("never moves the bar backwards or past 100%", () => {
    const uploading = run([
      { type: "pick", id: 1 },
      { type: "read", id: 1, preview: PREVIEW },
      { type: "progress", id: 1, value: 0.6 },
      { type: "progress", id: 1, value: 0.3 },
    ]);
    assert.equal(uploading.progress, 0.6);
    assert.equal(run([{ type: "progress", id: 1, value: 4 }], uploading).progress, 1);
    assert.equal(run([{ type: "progress", id: 1, value: Number.NaN }], uploading).progress, 0.6);
  });

  it("holds one video: a new pick replaces the old one and its late answers are ignored", () => {
    const first = run([
      { type: "pick", id: 1 },
      { type: "read", id: 1, preview: PREVIEW },
    ]);
    const second = run([{ type: "pick", id: 2 }], first);
    assert.equal(second.preview, null);
    const late = run(
      [
        { type: "progress", id: 1, value: 0.9 },
        { type: "uploaded", id: 1, video: VIDEO },
      ],
      second,
    );
    assert.equal(late.phase, "reading");
    assert.equal(late.video, null);
  });

  it("cancel mid-upload empties it, and the upload finishing later changes nothing", () => {
    const cancelled = run([
      { type: "pick", id: 1 },
      { type: "read", id: 1, preview: PREVIEW },
      { type: "progress", id: 1, value: 0.5 },
      { type: "remove" },
    ]);
    assert.equal(cancelled.phase, "empty");
    assert.equal(videoDraftActive(cancelled), false);
    assert.equal(videoDraftBusy(cancelled), false);
    assert.equal(run([{ type: "uploaded", id: 1, video: VIDEO }], cancelled).phase, "empty");
  });

  it("a failed read or upload leaves a message and no video", () => {
    const failed = run([
      { type: "pick", id: 1 },
      { type: "failed", id: 1, message: "Videos can be up to 60 seconds." },
    ]);
    assert.equal(failed.phase, "empty");
    assert.equal(failed.error, "Videos can be up to 60 seconds.");
    assert.equal(videoDraftBusy(failed), false);
    // The next pick clears it.
    assert.equal(run([{ type: "pick", id: 2 }], failed).error, null);
  });

  it("a mixing message leaves a finished video alone", () => {
    const ready = run([
      { type: "pick", id: 1 },
      { type: "read", id: 1, preview: PREVIEW },
      { type: "uploaded", id: 1, video: VIDEO },
    ]);
    const warned = run([{ type: "error", message: "A post can have photos or one video, not both." }], ready);
    assert.equal(warned.phase, "ready");
    assert.deepEqual(warned.video, VIDEO);
    assert.match(warned.error ?? "", /not both/);
  });
});
