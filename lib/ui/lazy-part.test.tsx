import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lazyPart } from "./lazy-part";

const Hello = ({ name }: { name: string }) => createElement("p", null, `hi ${name}`);
const Wait = ({ name }: { name: string }) => createElement("i", null, `wait ${name}`);

describe("lazyPart", () => {
  it("draws the fallback on the server, where nothing is loaded", () => {
    const Part = lazyPart(async () => Hello, Wait);
    assert.equal(renderToStaticMarkup(createElement(Part, { name: "a" })), "<i>wait a</i>");
    const Bare = lazyPart(async () => Hello);
    assert.equal(renderToStaticMarkup(createElement(Bare, { name: "a" })), "");
  });

  it("loads its chunk once, however often it is preloaded", async () => {
    let calls = 0;
    const Part = lazyPart(async () => {
      calls++;
      return Hello;
    });
    await Promise.all([Part.preload(), Part.preload(), Part.preload()]);
    assert.equal(calls, 1);
  });

  it("keeps a failed load retryable", async () => {
    let calls = 0;
    const Part = lazyPart(async () => {
      calls++;
      if (calls === 1) throw new Error("offline");
      return Hello;
    });
    await assert.rejects(Part.preload());
    await Part.preload();
    assert.equal(calls, 2);
  });

  it("never suspends: no React.lazy, no Suspense", async () => {
    const source = (await import("node:fs")).readFileSync(new URL("./lazy-part.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(source, /import[^;]*\b(lazy|Suspense)\b[^;]*from "react"/);
    assert.doesNotMatch(source, /from "next\/dynamic"/);
    assert.match(source, /useSyncExternalStore\(/);
  });
});
