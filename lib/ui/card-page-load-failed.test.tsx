import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { PartLoadFailed } from "@/components/card-page-parts";
import { CARD_TALK_HEADING, CardCollectorsSayingFailed } from "@/components/card-talk-frame";
import { SocialContext, type SocialContextValue } from "@/components/social-provider";

installDom();

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const social = { user: null, ready: true } as unknown as SocialContextValue;
const markup = (node: React.ReactElement) =>
  renderToStaticMarkup(createElement(SocialContext.Provider, { value: social }, node));

describe("card page parts whose chunk would not load", () => {
  it("keeps the posts section's box and header, with a compact Try again", () => {
    const out = markup(createElement(CardCollectorsSayingFailed, { cardId: "c1", retry: () => {} }));
    assert.match(out, new RegExp(CARD_TALK_HEADING));
    assert.match(out, /data-read-retry=""/);
    assert.match(out, /Couldn&#x27;t load this\./);
    assert.match(out, /<button type="button"[^>]*min-h-11[^>]*>Try again<\/button>/);
    assert.doesNotMatch(out, /py-16/);
    assert.doesNotMatch(out, /aria-busy/);
  });

  it("gives the sales list the same compact retry", () => {
    const out = markup(createElement(PartLoadFailed, { retry: () => {} }));
    assert.match(out, /Couldn&#x27;t load this\./);
    assert.match(out, />Try again</);
    assert.doesNotMatch(out, /py-16/);
  });

  it("names every card page part, gives two a failed view, and reports preload failures", () => {
    const parts = read("components/card-page-parts.tsx");
    const frame = read("components/card-talk-frame.tsx");
    assert.match(parts, /name: "comps-list", failed: PartLoadFailed/);
    assert.match(parts, /name: "card-added-panel", failed: PartLoadFailed/);
    assert.match(frame, /name: "card-collectors-saying", failed: CardCollectorsSayingFailed/);
    assert.doesNotMatch(parts, /\.catch\(\(\) => \{\}\)/);
    assert.match(parts, /LazyCompsList\.warm\(\);/);
    assert.match(parts, /LazyCardAddedPanel\.warm\(\);/);
  });
});
