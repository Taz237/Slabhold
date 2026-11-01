import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, it } from "node:test";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { installDom } from "@/lib/test/dom";
import {
  MoversSignedIn,
  MovingQuiet,
  MovingTodayCached,
  MovingTodayPanel,
} from "@/components/moving-today";
import { emptyMovingToday } from "./types";

installDom();

const router = {
  push: () => {},
  replace: () => {},
  refresh: () => {},
  prefetch: () => {},
  back: () => {},
  forward: () => {},
};

function html(element: ReactNode) {
  return renderToString(createElement(AppRouterContext.Provider, { value: router as never }, element));
}

function quietHref(out: string) {
  const match = out.match(/data-moving-today="quiet"[^]*?href="([^"]+)"/);
  assert.ok(match, "quiet strip renders a link");
  return match[1].replace(/&amp;/g, "&");
}

const empty = emptyMovingToday("2026-10-22");

describe("quiet movers strip and the viewer", () => {
  it("invites a signed-out reader to sign up, coming back to add a card", () => {
    const out = html(createElement(MoversSignedIn, { value: false }, createElement(MovingTodayPanel, { payload: empty })));
    assert.equal(quietHref(out), "/signup?next=%2Fcards%2Fnew");
    assert.equal(quietHref(html(createElement(MovingQuiet, { signedIn: false }))), "/signup?next=%2Fcards%2Fnew");
    // Same copy, same look.
    assert.match(out, /Prices are quiet this week\./);
    assert.match(out, /Add a card to see its comps/);
  });

  it("keeps /cards/new for a signed-in reader and the server-rendered Home row", () => {
    const signedIn = html(createElement(MoversSignedIn, { value: true }, createElement(MovingTodayPanel, { payload: empty })));
    assert.equal(quietHref(signedIn), "/cards/new");
    assert.equal(quietHref(html(createElement(MovingTodayCached, { payload: empty }))), "/cards/new");
    assert.equal(quietHref(html(createElement(MovingQuiet))), "/cards/new");
  });

  it("is decided in the feed the same way as the signed-out banner", () => {
    const feed = readFileSync(join(process.cwd(), "components/feed-view.tsx"), "utf8");
    const provider = feed.indexOf("<MoversSignedIn value={Boolean(user)}>");
    const slot = feed.indexOf('lane === "foryou" ? movingToday ?? <MovingToday />');
    const close = feed.indexOf("</MoversSignedIn>");
    assert.ok(provider > 0 && provider < slot && slot < close);
    assert.match(feed, /\{user \? \(\s*<Composer[^]*?<SignedOutBanner \/>/);
  });
});
