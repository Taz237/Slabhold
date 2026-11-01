import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { LAZY_PART_RETRY_MS, lazyPart } from "./lazy-part";

installDom();

const Hello = ({ name }: { name: string }) => createElement("p", null, `hi ${name}`);
const Wait = ({ name }: { name: string }) => createElement("i", null, `wait ${name}`);
const Failed = ({ name, retry }: { name: string; retry: () => void }) =>
  createElement("button", { type: "button", onClick: retry }, `failed ${name}`);

let root: Root;
let host: HTMLElement;
let warned: unknown[][];
const realWarn = console.warn;

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout"] });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  warned = [];
  console.warn = (...args: unknown[]) => void warned.push(args);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  mock.timers.reset();
  console.warn = realWarn;
});

/** Let pending promise callbacks run inside act. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function tick(ms: number) {
  await act(async () => {
    mock.timers.tick(ms);
  });
  await settle();
}

describe("lazyPart when its chunk fails", () => {
  it("retries once by itself and draws the part", async () => {
    let calls = 0;
    const Part = lazyPart(
      async () => {
        calls++;
        if (calls === 1) throw new Error("ChunkLoadError");
        return Hello;
      },
      Wait,
      { name: "hello", failed: Failed },
    );
    act(() => root.render(createElement(Part, { name: "a" })));
    await settle();
    assert.equal(host.innerHTML, "<i>wait a</i>");
    assert.deepEqual(warned[0], ["[lazy-part]", "hello", "ChunkLoadError"]);
    await tick(LAZY_PART_RETRY_MS - 1);
    assert.equal(calls, 1);
    await tick(1);
    assert.equal(calls, 2);
    assert.equal(host.innerHTML, "<p>hi a</p>");
  });

  it("shows `failed` after the retry fails too, and retry() draws the part once it loads", async () => {
    let working = false;
    let calls = 0;
    const Part = lazyPart(
      async () => {
        calls++;
        if (!working) throw new Error("offline");
        return Hello;
      },
      Wait,
      { name: "hello", failed: Failed },
    );
    act(() => root.render(createElement(Part, { name: "a" })));
    await settle();
    await tick(LAZY_PART_RETRY_MS);
    assert.equal(calls, 2);
    assert.equal(host.innerHTML, '<button type="button">failed a</button>');
    assert.equal(warned.length, 2);
    assert.ok(warned.every((args) => args[0] === "[lazy-part]" && args[1] === "hello"));
    // No more automatic tries.
    await tick(LAZY_PART_RETRY_MS * 4);
    assert.equal(calls, 2);

    working = true;
    act(() => host.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    assert.equal(calls, 3);
    assert.equal(host.innerHTML, "<p>hi a</p>");
  });

  it("without `failed`, keeps today's output after giving up: the fallback, or nothing", async () => {
    const WithFallback = lazyPart(
      async () => {
        throw new Error("offline");
      },
      Wait,
    );
    const Bare = lazyPart<{ name: string }>(async () => {
      throw new Error("offline");
    });
    act(() =>
      root.render(
        createElement("div", null, createElement(WithFallback, { name: "a" }), createElement(Bare, { name: "b" })),
      ),
    );
    await settle();
    await tick(LAZY_PART_RETRY_MS);
    assert.equal(host.innerHTML, "<div><i>wait a</i></div>");
    assert.equal(warned.length, 4);
    assert.deepEqual(warned[0], ["[lazy-part]", "part", "offline"]);
  });

  it("still gives the server and hydration the fallback", () => {
    const Part = lazyPart(async () => Hello, Wait, { name: "hello", failed: Failed });
    assert.equal(renderToStaticMarkup(createElement(Part, { name: "a" })), "<i>wait a</i>");
  });

  it("does not retry when nothing is mounted", async () => {
    let calls = 0;
    const Part = lazyPart(async () => {
      calls++;
      throw new Error("offline");
    });
    await assert.rejects(Part.preload());
    await tick(LAZY_PART_RETRY_MS * 2);
    assert.equal(calls, 1);
    assert.equal(warned.length, 1);
  });

  it("warm() fetches ahead and reports a failure instead of throwing", async () => {
    const Part = lazyPart(
      async () => {
        throw new Error("offline");
      },
      null,
      { name: "warm" },
    );
    assert.equal(Part.warm(), undefined);
    await settle();
    assert.deepEqual(warned, [["[lazy-part]", "warm", "offline"]]);
  });
});
