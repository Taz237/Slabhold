import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTOPLAY_RATIO,
  VIDEO_GIF_ERROR,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  VIDEO_MIX_ERROR,
  VIDEO_ONE_ERROR,
  VIDEO_READ_ERROR,
  VIDEO_THREAD_ERROR,
  VIDEO_TOO_LARGE_ERROR,
  VIDEO_TOO_LONG_ERROR,
  VIDEO_TYPE_ERROR,
  VIDEO_TYPE_ERROR_PHOTOS_ONLY,
  autoplayAllowed,
  checkVideoLimits,
  feedVideoAspect,
  feedVideoCrops,
  formatVideoTime,
  isPostVideoUrl,
  isVideoFile,
  libraryAccept,
  pickAutoplay,
  planMediaPick,
  postVideoPaths,
  sanitizeVideo,
  videoColumnMissing,
  videoFileProblem,
  videoMetadataProblem,
  videoMime,
  videoTimeLeft,
} from "./videos";
import { frameLooksBlank, posterSize, posterTimes } from "@/lib/ui/video-poster";

// Read when each check runs, so setting it here is enough.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://knuwflptobyutrauxblj.supabase.co";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const POSTER = "44444444-4444-4444-8444-444444444444";
const BASE = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/post-videos";
const MB = 1024 * 1024;

function stored(over: Record<string, unknown> = {}) {
  return {
    url: `${BASE}/${OWNER}/${FILE}.mov`,
    poster: `${BASE}/${OWNER}/${POSTER}.jpg`,
    width: 1080,
    height: 1920,
    duration: 12.4,
    mime: "video/quicktime",
    ...over,
  };
}

describe("video limits", () => {
  it("allows up to 60 seconds and 100 MB", () => {
    assert.equal(VIDEO_MAX_SECONDS, 60);
    assert.equal(VIDEO_MAX_BYTES, 100 * MB);
    const file = { type: "video/quicktime", name: "IMG_0001.MOV", size: 40 * MB };
    assert.equal(checkVideoLimits(file, { duration: 59.9, width: 1080, height: 1920 }), null);
    assert.equal(checkVideoLimits(file, { duration: 60, width: 1080, height: 1920 }), null);
    // Metadata can round a 60 second clip up a little.
    assert.equal(checkVideoLimits(file, { duration: 60.4, width: 1080, height: 1920 }), null);
  });

  it("refuses a clip over 60 seconds with a friendly message", () => {
    const file = { type: "video/mp4", name: "a.mp4", size: 10 * MB };
    assert.equal(checkVideoLimits(file, { duration: 61, width: 1920, height: 1080 }), VIDEO_TOO_LONG_ERROR);
    assert.match(VIDEO_TOO_LONG_ERROR, /60 seconds/);
  });

  it("refuses a file over 100 MB before reading it", () => {
    assert.equal(videoFileProblem({ type: "video/mp4", name: "a.mp4", size: 100 * MB }), null);
    assert.equal(videoFileProblem({ type: "video/mp4", name: "a.mp4", size: 100 * MB + 1 }), VIDEO_TOO_LARGE_ERROR);
    assert.match(VIDEO_TOO_LARGE_ERROR, /100 MB/);
  });

  it("takes MP4 and MOV, by type or by name when iOS leaves the type empty", () => {
    assert.equal(videoMime({ type: "video/mp4" }), "video/mp4");
    assert.equal(videoMime({ type: "video/quicktime" }), "video/quicktime");
    assert.equal(videoMime({ type: "", name: "IMG_4410.MOV" }), "video/quicktime");
    assert.equal(videoMime({ type: "", name: "clip.mp4" }), "video/mp4");
    assert.equal(videoMime({ type: "video/webm", name: "a.webm" }), null);
    assert.equal(videoFileProblem({ type: "video/webm", name: "a.webm", size: MB }), VIDEO_TYPE_ERROR);
    assert.equal(videoFileProblem({ type: "video/mp4", name: "a.mp4", size: 0 }), VIDEO_READ_ERROR);
  });

  it("refuses a clip the browser can't size or time", () => {
    assert.equal(videoMetadataProblem({ duration: Number.NaN, width: 10, height: 10 }), VIDEO_READ_ERROR);
    assert.equal(videoMetadataProblem({ duration: 0, width: 10, height: 10 }), VIDEO_READ_ERROR);
    assert.equal(videoMetadataProblem({ duration: 5, width: 0, height: 10 }), VIDEO_READ_ERROR);
  });

  it("tells a video from a photo", () => {
    assert.equal(isVideoFile({ type: "video/quicktime" }), true);
    assert.equal(isVideoFile({ type: "image/heic", name: "a.heic" }), false);
    assert.equal(isVideoFile({ type: "", name: "IMG.MOV" }), true);
    assert.equal(isVideoFile({ type: "", name: "IMG.HEIC" }), false);
  });

  it("opens the library on photos and video only where video is on", () => {
    assert.equal(libraryAccept("image/*", false), "image/*");
    assert.equal(libraryAccept("image/*", true), "image/*,video/mp4,video/quicktime,.mp4,.mov");
  });
});

describe("composer media rules", () => {
  const video = { type: "video/quicktime", name: "a.mov" };
  const photo = { type: "image/jpeg", name: "a.jpg" };
  const empty = { photos: 0, hasVideo: false, hasGif: false, videoAllowed: true };

  it("takes one video", () => {
    assert.deepEqual(planMediaPick([video], empty), { kind: "video", file: video });
  });

  it("refuses two videos, or a second one", () => {
    assert.deepEqual(planMediaPick([video, video], empty), { kind: "error", message: VIDEO_ONE_ERROR });
    assert.deepEqual(planMediaPick([video], { ...empty, hasVideo: true }), { kind: "error", message: VIDEO_ONE_ERROR });
  });

  it("never mixes photos and a video, either way round", () => {
    assert.deepEqual(planMediaPick([video, photo], empty), { kind: "error", message: VIDEO_MIX_ERROR });
    assert.deepEqual(planMediaPick([video], { ...empty, photos: 2 }), { kind: "error", message: VIDEO_MIX_ERROR });
    assert.deepEqual(planMediaPick([photo], { ...empty, hasVideo: true }), { kind: "error", message: VIDEO_MIX_ERROR });
    assert.match(VIDEO_MIX_ERROR, /photos or one video/);
  });

  it("never puts a video with a GIF or in a thread", () => {
    assert.deepEqual(planMediaPick([video], { ...empty, hasGif: true }), { kind: "error", message: VIDEO_GIF_ERROR });
    assert.deepEqual(planMediaPick([video], { ...empty, threaded: true }), { kind: "error", message: VIDEO_THREAD_ERROR });
  });

  it("passes photos straight through, and says so when video isn't on", () => {
    assert.deepEqual(planMediaPick([photo, photo], empty), { kind: "photos", files: [photo, photo] });
    assert.deepEqual(planMediaPick([video], { ...empty, videoAllowed: false }), {
      kind: "error",
      message: VIDEO_TYPE_ERROR_PHOTOS_ONLY,
    });
    assert.deepEqual(planMediaPick([], empty), { kind: "none" });
  });
});

describe("stored videos", () => {
  it("keeps a video in this project's post-videos bucket", () => {
    assert.deepEqual(sanitizeVideo(stored()), stored());
    assert.deepEqual(sanitizeVideo(stored(), OWNER), stored());
  });

  it("drops a video in someone else's folder when the owner is known", () => {
    assert.equal(sanitizeVideo(stored(), OTHER), null);
  });

  it("drops other hosts, other buckets, wrong file types and bad numbers", () => {
    assert.equal(sanitizeVideo(stored({ url: "https://example.com/a.mov" })), null);
    assert.equal(sanitizeVideo(stored({ url: `${BASE.replace("post-videos", "post-images")}/${OWNER}/${FILE}.mov` })), null);
    assert.equal(sanitizeVideo(stored({ poster: `${BASE}/${OWNER}/${POSTER}.png` })), null);
    assert.equal(sanitizeVideo(stored({ url: `${BASE}/${OWNER}/${FILE}.mov?x=1` })), null);
    assert.equal(sanitizeVideo(stored({ url: `${BASE}/${OWNER}/../${FILE}.mov` })), null);
    assert.equal(sanitizeVideo(stored({ duration: 61 })), null);
    assert.equal(sanitizeVideo(stored({ width: 0 })), null);
    assert.equal(sanitizeVideo(stored({ mime: "video/webm" })), null);
    assert.equal(sanitizeVideo(null), null);
    assert.equal(sanitizeVideo("video"), null);
  });

  it("knows the two storage paths a video owns", () => {
    assert.deepEqual(postVideoPaths(stored()), [`${OWNER}/${FILE}.mov`, `${OWNER}/${POSTER}.jpg`]);
    assert.deepEqual(postVideoPaths(null), []);
    assert.deepEqual(postVideoPaths({ url: "https://example.com/a.mov", poster: "nope" }), []);
    assert.equal(isPostVideoUrl(stored().poster, "video"), false);
    assert.equal(isPostVideoUrl(stored().poster, "poster"), true);
  });

  it("spots a missing video column", () => {
    assert.equal(videoColumnMissing({ code: "42703", message: 'column posts.video does not exist' }), true);
    assert.equal(videoColumnMissing({ code: "PGRST204", message: "Could not find the 'video' column" }), true);
    assert.equal(videoColumnMissing({ code: "42703", message: "column posts.gif does not exist" }), false);
    assert.equal(videoColumnMissing(null), false);
  });
});

describe("video layout and time", () => {
  it("keeps wide clips' shape and puts tall ones in 4:5", () => {
    assert.equal(feedVideoAspect({ width: 1920, height: 1080 }), "1920 / 1080");
    assert.equal(feedVideoCrops({ width: 1920, height: 1080 }), false);
    assert.equal(feedVideoAspect({ width: 1080, height: 1920 }), "4 / 5");
    assert.equal(feedVideoCrops({ width: 1080, height: 1920 }), true);
  });

  it("shows m:ss and counts down what is left", () => {
    assert.equal(formatVideoTime(0), "0:00");
    assert.equal(formatVideoTime(7.9), "0:07");
    assert.equal(formatVideoTime(60), "1:00");
    assert.equal(formatVideoTime(Number.NaN), "0:00");
    assert.equal(videoTimeLeft(12.4, 0), 13);
    assert.equal(videoTimeLeft(12.4, 10), 3);
    assert.equal(videoTimeLeft(12.4, 13), 0);
  });
});

describe("autoplay", () => {
  it("waits under Reduce Motion or Low Data", () => {
    assert.equal(autoplayAllowed({ reducedMotion: false, saveData: false }), true);
    assert.equal(autoplayAllowed({ reducedMotion: true, saveData: false }), false);
    assert.equal(autoplayAllowed({ reducedMotion: false, saveData: true }), false);
  });

  it("starts a clip once 60% of it is on screen", () => {
    assert.equal(AUTOPLAY_RATIO, 0.6);
    assert.equal(pickAutoplay(new Map([["a", { ratio: 0.59, top: 0 }]]), null), null);
    assert.equal(pickAutoplay(new Map([["a", { ratio: 0.6, top: 0 }]]), null), "a");
  });

  it("plays the most visible clip, the higher one on a tie", () => {
    const visible = new Map([
      ["a", { ratio: 0.7, top: 300 }],
      ["b", { ratio: 0.9, top: 500 }],
      ["c", { ratio: 0.9, top: 100 }],
    ]);
    assert.equal(pickAutoplay(visible, null), "c");
  });

  it("keeps the playing clip while it stays 60% visible, and stops it once it scrolls away", () => {
    const both = new Map([
      ["a", { ratio: 0.65, top: 0 }],
      ["b", { ratio: 1, top: 400 }],
    ]);
    assert.equal(pickAutoplay(both, "a"), "a");
    const away = new Map([
      ["a", { ratio: 0.2, top: -300 }],
      ["b", { ratio: 1, top: 100 }],
    ]);
    assert.equal(pickAutoplay(away, "a"), "b");
    assert.equal(pickAutoplay(new Map([["a", { ratio: 0, top: -900 }]]), "a"), null);
  });
});

describe("poster frame", () => {
  function frame(rgb: [number, number, number][]): Uint8ClampedArray {
    return new Uint8ClampedArray(rgb.flatMap(([r, g, b]) => [r, g, b, 255]));
  }

  it("skips a black or flat frame and keeps a real one", () => {
    assert.equal(frameLooksBlank(frame(Array.from({ length: 16 }, () => [0, 0, 0]))), true);
    assert.equal(frameLooksBlank(frame(Array.from({ length: 16 }, () => [120, 120, 120]))), true);
    assert.equal(
      frameLooksBlank(frame(Array.from({ length: 16 }, (_, i) => (i % 2 ? [200, 180, 40] : [30, 60, 90])))),
      false,
    );
    assert.equal(frameLooksBlank(new Uint8ClampedArray()), true);
  });

  it("tries early moments first and stays inside the clip", () => {
    assert.deepEqual(posterTimes(12), [0.1, 1, 3, 6]);
    assert.deepEqual(posterTimes(0.5), [0.1, 0.13, 0.25, 0.45]);
    for (const time of posterTimes(0.5)) assert.ok(time < 0.5);
  });

  it("keeps the clip's shape, longest side at most 1280", () => {
    assert.deepEqual(posterSize(1080, 1920), { width: 720, height: 1280 });
    assert.deepEqual(posterSize(640, 360), { width: 640, height: 360 });
  });
});
