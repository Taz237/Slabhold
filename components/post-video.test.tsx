import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PostVideoPlayer, VideoDraftTile, VideoThumbMark } from "@/components/post-video";
import { EMPTY_VIDEO_DRAFT, videoDraftReducer } from "@/lib/social/video-draft";
import type { PostVideo } from "@/lib/social/videos";

const BASE = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/post-videos/u";
const VIDEO: PostVideo = {
  url: `${BASE}/v.mov`,
  poster: `${BASE}/p.jpg`,
  width: 1080,
  height: 1920,
  duration: 12.4,
  mime: "video/quicktime",
};

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("timeline video", () => {
  it("plays inline and muted, loads metadata only, shows its poster and no native controls", () => {
    const html = renderToStaticMarkup(createElement(PostVideoPlayer, { video: VIDEO }));
    assert.match(html, /<video[^>]*playsInline|<video[^>]*playsinline/i);
    assert.match(html, /<video[^>]*preload="metadata"/);
    assert.match(html, new RegExp(`<video[^>]*poster="${VIDEO.poster.replace(/[.]/g, "\\.")}"`));
    assert.match(html, /<video[^>]*loop/);
    assert.doesNotMatch(html, /<video[^>]*controls=""/);
    const player = read("components/post-video.tsx");
    // iOS only autoplays a muted element: the property is set before anything plays.
    assert.match(player, /element\.muted = true;/);
    assert.match(player, /muted\n\s+loop\n\s+playsInline\n\s+preload="metadata"/);
  });

  it("reserves its exact space from the saved shape, so the feed never jumps", () => {
    const tall = renderToStaticMarkup(createElement(PostVideoPlayer, { video: VIDEO }));
    assert.match(tall, /aspect-ratio:4 \/ 5/);
    const wide = renderToStaticMarkup(createElement(PostVideoPlayer, { video: { ...VIDEO, width: 1920, height: 1080 } }));
    assert.match(wide, /aspect-ratio:1920 \/ 1080/);
    // The post page: the real shape, never taller than 80% of the screen.
    const full = renderToStaticMarkup(createElement(PostVideoPlayer, { video: VIDEO, fit: "full" }));
    assert.match(full, /aspect-ratio:1080 \/ 1920/);
    assert.match(full, /width:min\(100%, calc\(80svh \* 0\.5625\)\)/);
  });

  it("has a time-left pill, a 44px sound button and opens full screen on tap", () => {
    const html = renderToStaticMarkup(createElement(PostVideoPlayer, { video: VIDEO }));
    assert.match(html, />0:13</);
    assert.match(html, /aria-label="Turn sound on"[^>]*class="[^"]*h-11 w-11/);
    assert.match(html, /aria-label="Play Video, 0:12, full screen"/);
  });

  it("swaps a clip this device can't play for a clean tile", () => {
    const tile = read("components/viewer-video.tsx");
    assert.match(tile, /Can't play this video|VIDEO_UNPLAYABLE/);
    const player = read("components/post-video.tsx");
    assert.match(player, /onError=\{\(\) => setFailed\(true\)\}/);
    assert.match(player, /<UnplayableTile poster=\{video\.poster\} \/>/);
  });

  it("is wired into the timeline, replies, quotes, DMs and the profile Media tab", () => {
    assert.match(read("components/tweet.tsx"), /<PostVideoPlayer video=\{post\.video\}/);
    assert.match(read("components/tweet.tsx"), /<PostVideoPlayer video=\{comment\.video\} size="reply"/);
    assert.match(read("components/post-view.tsx"), /<PostVideoPlayer video=\{reply\.video\} size="reply"/);
    assert.match(read("components/quoted-post-embed.tsx"), /<VideoThumbMark \/>/);
    assert.match(read("components/message-attachments.tsx"), /<VideoThumbMark \/>/);
    assert.match(read("lib/social/profile-tabs.ts"), /if \(post\.video\) return true;/);
  });
});

describe("composer video tile", () => {
  const uploading = [
    { type: "pick" as const, id: 1 },
    {
      type: "read" as const,
      id: 1,
      preview: { src: "blob:v", poster: "blob:p", width: 1920, height: 1080, duration: 42 },
    },
    { type: "progress" as const, id: 1, value: 0.37 },
  ].reduce(videoDraftReducer, EMPTY_VIDEO_DRAFT);

  it("shows the poster, the length, a real progress bar and Cancel", () => {
    const html = renderToStaticMarkup(createElement(VideoDraftTile, { draft: uploading, onRemove: () => {} }));
    assert.match(html, /src="blob:p"/);
    assert.match(html, />0:42</);
    assert.match(html, /role="progressbar"[^>]*aria-valuenow="37"/);
    assert.match(html, /aria-label="Cancel video upload"/);
  });

  it("says Remove once it has uploaded, and draws nothing when empty", () => {
    const ready = videoDraftReducer(uploading, {
      type: "uploaded",
      id: 1,
      video: { ...VIDEO, width: 1920, height: 1080 },
    });
    const html = renderToStaticMarkup(createElement(VideoDraftTile, { draft: ready, onRemove: () => {} }));
    assert.match(html, /aria-label="Remove video"/);
    assert.doesNotMatch(html, /progressbar/);
    assert.equal(renderToStaticMarkup(createElement(VideoDraftTile, { draft: EMPTY_VIDEO_DRAFT, onRemove: () => {} })), "");
  });

  it("puts a play mark and the length on a poster thumbnail", () => {
    const html = renderToStaticMarkup(createElement(VideoThumbMark, { duration: 7 }));
    assert.match(html, /0:07/);
    assert.match(html, /aria-hidden="true"/);
  });
});
