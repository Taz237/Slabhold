import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { act, createElement, type ComponentType } from "react";
import { installDom } from "@/lib/test/dom";
import type { PostGif } from "@/lib/social/gifs";
import type { GifPickerProps } from "./gif-picker";

const { win, state } = installDom();

const gif = (id: string, height = 113): PostGif => ({
  id,
  mp4: `https://media2.giphy.com/media/${id}/200w.mp4`,
  still: `https://media2.giphy.com/media/${id}/200w_s.gif`,
  width: 200,
  height,
  title: `${id} title`,
});

let GifPickerView: ComponentType<GifPickerProps>;
let PostGifPlayer: ComponentType<{ gif: PostGif; size?: "post" | "reply" }>;
let gifColumns: (gifs: readonly PostGif[]) => [PostGif[], PostGif[]];

before(async () => {
  ({ GifPickerView, gifColumns } = await import("./gif-picker-view"));
  ({ PostGifPlayer } = await import("./post-gif"));
});

type Answer = { status?: number; body: unknown };
let requests: string[] = [];
const realFetch = globalThis.fetch;

function answerWith(pick: (url: URL) => Answer) {
  requests = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input), "http://localhost/");
    requests.push(url.pathname + url.search);
    const answer = pick(url);
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
  }) as typeof fetch;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function open(props: Partial<GifPickerProps> = {}) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  const picked: PostGif[] = [];
  let closed = 0;
  await act(async () => {
    root.render(
      createElement(GifPickerView, {
        onPick: (value) => picked.push(value),
        onClose: () => (closed += 1),
        ...props,
      }),
    );
    await wait(20);
  });
  return {
    picked,
    closed: () => closed,
    close() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const sheet = () => win.document.querySelector("[data-gif-picker]")!;
const options = () => [...sheet().querySelectorAll<HTMLButtonElement>("[data-gif-option]")];

async function type(value: string) {
  const input = sheet().querySelector("input")!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    await wait(450);
  });
}

afterEach(() => {
  globalThis.fetch = realFetch;
  state.reducedMotion = false;
});

describe("GIF picker", () => {
  it("opens on trending GIFs from our own route and credits GIPHY", async () => {
    answerWith(() => ({ body: { gifs: [gif("a1"), gif("b2")], nextOffset: null } }));
    const picker = await open();
    assert.deepEqual(requests, ["/api/gifs/search"]);
    assert.equal(options().length, 2);
    assert.match(sheet().textContent ?? "", /Powered by GIPHY/);
    const dialog = sheet().querySelector("[role='dialog']")!;
    assert.equal(dialog.getAttribute("aria-label"), "Choose a GIF");
    assert.equal(win.document.activeElement, sheet().querySelector("input"), "the search box has focus");
    picker.close();
  });

  it("searches as you type and hands back the GIF you tap", async () => {
    answerWith((url) => ({
      body: { gifs: url.searchParams.get("q") ? [gif("hit1"), gif("hit2")] : [gif("trend")], nextOffset: null },
    }));
    const picker = await open();
    await type("big pull");
    assert.equal(requests.at(-1), "/api/gifs/search?q=big+pull");
    assert.deepEqual(options().map((item) => item.getAttribute("aria-label")), [
      "Use GIF: hit1 title",
      "Use GIF: hit2 title",
    ]);
    act(() => options()[1]!.click());
    assert.deepEqual(picker.picked, [gif("hit2")]);
    picker.close();
  });

  it("plays previews muted and inline, and shows stills under Reduce Motion", async () => {
    answerWith(() => ({ body: { gifs: [gif("a1")], nextOffset: null } }));
    const moving = await open();
    const video = options()[0]!.querySelector("video")!;
    assert.ok(video, "a preview plays");
    assert.equal(video.muted, true);
    assert.equal(video.loop, true);
    assert.ok(video.hasAttribute("playsinline"));
    moving.close();

    state.reducedMotion = true;
    const still = await open();
    assert.equal(options()[0]!.querySelector("video"), null);
    assert.ok(options()[0]!.querySelector("img[data-gif-still]"));
    still.close();
  });

  it("drops anything that is not a GIPHY GIF", async () => {
    answerWith(() => ({
      body: { gifs: [gif("ok1"), { ...gif("bad"), mp4: "https://evil.example/x.mp4" }], nextOffset: null },
    }));
    const picker = await open();
    assert.equal(options().length, 1);
    picker.close();
  });

  it("says so when nothing matches", async () => {
    answerWith((url) => ({ body: { gifs: url.searchParams.get("q") ? [] : [gif("trend")], nextOffset: null } }));
    const picker = await open();
    await type("zzzz");
    assert.equal(options().length, 0);
    assert.match(sheet().textContent ?? "", /No GIFs for .zzzz./);
    picker.close();
  });

  it("shows the server's message with Try again, and recovers", async () => {
    let fail = true;
    answerWith(() =>
      fail
        ? { status: 429, body: { error: "You're searching GIFs too quickly. Please wait a bit and try again." } }
        : { body: { gifs: [gif("a1")], nextOffset: null } },
    );
    const picker = await open();
    const alert = sheet().querySelector("[role='alert']")!;
    assert.match(alert.textContent ?? "", /searching GIFs too quickly/);
    fail = false;
    const retry = [...alert.querySelectorAll("button")].find((button) => button.textContent === "Try again")!;
    await act(async () => {
      retry.click();
      await wait(20);
    });
    assert.equal(options().length, 1);
    picker.close();
  });

  it("loads the next page under the first", async () => {
    answerWith((url) =>
      url.searchParams.get("offset")
        ? { body: { gifs: [gif("a1"), gif("c3")], nextOffset: null } }
        : { body: { gifs: [gif("a1"), gif("b2")], nextOffset: 24 } },
    );
    const picker = await open();
    const more = [...sheet().querySelectorAll("button")].find((button) => button.textContent === "Show more")!;
    await act(async () => {
      more.click();
      await wait(20);
    });
    assert.equal(requests.at(-1), "/api/gifs/search?offset=24");
    assert.equal(options().length, 3, "a repeated GIF is shown once");
    picker.close();
  });

  it("closes on Escape and on the close button, and Enter does not leave the sheet", async () => {
    answerWith(() => ({ body: { gifs: [gif("a1")], nextOffset: null } }));
    const picker = await open();
    const enter = new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => void sheet().querySelector("input")!.dispatchEvent(enter));
    assert.equal(enter.defaultPrevented, true, "Enter must not send the post under the sheet");
    act(() => void win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(picker.closed(), 1);
    act(() => sheet().querySelector<HTMLButtonElement>("[aria-label='Close GIF search']")!.click());
    assert.equal(picker.closed(), 2);
    picker.close();
  });

  it("gives every control a 44px target", async () => {
    answerWith(() => ({ body: { gifs: [gif("a1")], nextOffset: 24 } }));
    const picker = await open();
    for (const button of sheet().querySelectorAll("button")) {
      assert.match(button.className, /\b(h-11|min-h-11)\b/, button.getAttribute("aria-label") ?? button.textContent ?? "");
    }
    picker.close();
  });

  it("fills the shorter column first", () => {
    const [left, right] = gifColumns([gif("tall", 400), gif("b"), gif("c"), gif("d")]);
    assert.deepEqual(left.map((item) => item.id), ["tall"]);
    assert.deepEqual(right.map((item) => item.id), ["b", "c", "d"]);
  });
});

describe("a GIF on a post", () => {
  async function show(size?: "post" | "reply") {
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(PostGifPlayer, { gif: gif("a1"), size })));
    return {
      button: () => host.querySelector<HTMLButtonElement>("[data-post-gif]")!,
      close() {
        act(() => root.unmount());
        host.remove();
      },
    };
  }

  it("autoplays muted and looping, inline, and a tap pauses it", async () => {
    const player = await show();
    const video = player.button().querySelector("video")!;
    assert.equal(video.muted, true);
    assert.equal(video.loop, true);
    assert.ok(video.hasAttribute("playsinline"));
    assert.equal(video.getAttribute("src"), gif("a1").mp4);
    assert.equal(video.getAttribute("poster"), gif("a1").still);
    assert.equal(player.button().getAttribute("aria-label"), "Pause GIF: a1 title");
    assert.match(player.button().textContent ?? "", /via GIPHY/);
    act(() => player.button().click());
    assert.equal(player.button().querySelector("video"), null);
    assert.equal(player.button().getAttribute("aria-label"), "Play GIF: a1 title");
    player.close();
  });

  it("under Reduce Motion shows a still with a play button, and plays on a tap", async () => {
    state.reducedMotion = true;
    const player = await show();
    assert.equal(player.button().querySelector("video"), null, "nothing moves until asked");
    assert.equal(player.button().querySelector("img")?.getAttribute("src"), gif("a1").still);
    assert.equal(player.button().getAttribute("aria-label"), "Play GIF: a1 title");
    assert.equal(player.button().getAttribute("data-playing"), "false");
    act(() => player.button().click());
    assert.ok(player.button().querySelector("video"), "the tap plays it");
    assert.equal(player.button().getAttribute("data-playing"), "true");
    player.close();
  });

  it("keeps its shape before it loads", async () => {
    const player = await show("reply");
    assert.equal(player.button().style.aspectRatio, "200 / 113");
    assert.equal(player.button().style.maxWidth, "240px");
    player.close();
  });
});
