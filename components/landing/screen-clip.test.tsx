import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, createElement } from "react";
import { installDom } from "@/lib/test/dom";

const { win, state } = installDom();

type Entry = { isIntersecting: boolean };
let observers: { fire: (entry: Entry) => void; disconnected: boolean }[] = [];

class FakeObserver {
  private readonly record: { fire: (entry: Entry) => void; disconnected: boolean };
  constructor(callback: (entries: Entry[]) => void) {
    this.record = { fire: (entry) => callback([entry]), disconnected: false };
    observers.push(this.record);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.record.disconnected = true;
  }
}
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeObserver;

const calls: string[] = [];
win.HTMLMediaElement.prototype.play = function play() {
  calls.push("play");
  return Promise.resolve();
};
win.HTMLMediaElement.prototype.pause = function pause() {
  calls.push("pause");
};

const STILL = { src: "/_next/image?url=%2Flanding%2Fscreens%2Fprofile-cards.png&w=828&q=75", width: 720, height: 1560, alt: "A profile in the Slabhold app" };
const VIDEO = "/landing/screens/profile-cards.mp4";

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  observers = [];
  calls.length = 0;
  state.reducedMotion = false;
});

async function mount() {
  const { ScreenClip } = await import("@/components/landing/screen-clip");
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(ScreenClip, { still: STILL, video: VIDEO }));
  });
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

describe("landing screen clip", () => {
  it("is only its lazy still until it scrolls into view: no video, nothing loading", async () => {
    const host = await mount();
    assert.equal(host.querySelectorAll("video").length, 0);
    const img = host.querySelector("img");
    assert.equal(img?.getAttribute("loading"), "lazy");
    assert.equal(img?.getAttribute("alt"), STILL.alt);
    assert.equal(host.querySelector(".lp-screen")?.getAttribute("data-landing-screen"), "clip");
    assert.deepEqual(calls, []);
  });

  it("adds the muted, looping, inline video in view, with the still as its poster, and plays it", async () => {
    const host = await mount();
    await act(async () => observers[0].fire({ isIntersecting: true }));
    const video = host.querySelector("video");
    assert.ok(video);
    assert.equal(video.getAttribute("src"), VIDEO);
    assert.equal(video.getAttribute("poster"), STILL.src);
    assert.equal(video.getAttribute("preload"), "none");
    assert.ok(video.hasAttribute("loop"));
    assert.ok(video.hasAttribute("playsinline"));
    assert.ok(video.hasAttribute("autoplay"));
    assert.equal(video.muted, true);
    assert.equal(host.querySelectorAll("button").length, 0, "no pause or play control");
    assert.deepEqual(calls, ["play"]);
  });

  it("pauses when it scrolls out and plays again when it comes back", async () => {
    await mount();
    await act(async () => observers[0].fire({ isIntersecting: true }));
    await act(async () => observers[0].fire({ isIntersecting: false }));
    await act(async () => observers[0].fire({ isIntersecting: true }));
    assert.deepEqual(calls, ["play", "pause", "play"]);
  });

  it("stays the still with reduced motion: it never watches, loads or plays", async () => {
    state.reducedMotion = true;
    const host = await mount();
    assert.equal(observers.length, 0);
    assert.equal(host.querySelectorAll("video").length, 0);
    assert.equal(host.querySelectorAll("img").length, 1);
    assert.deepEqual(calls, []);
  });

  it("stops watching when it leaves the page", async () => {
    await mount();
    cleanup?.();
    cleanup = null;
    assert.equal(observers[0].disconnected, true);
  });

  it("puts nothing in the head: no preload, no link, no eager source", () => {
    const source = readFileSync(join(process.cwd(), "components/landing/screen-clip.tsx"), "utf8");
    assert.match(source, /preload="none"/);
    assert.doesNotMatch(source, /rel="preload"|<link|preload\(|preinit|preload="(auto|metadata)"/);
    assert.match(source, /\{poster \? \(\s*<video/, "the video exists only after the frame is on screen");
  });
});
