import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { FALLBACK_ICON, pushIcon } from "@/lib/push/payload";
import { SAFETY_ACTION_FAILED } from "@/lib/safety/report";
import { newYorkDayStartIso } from "@/lib/wants/ny-day";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("cleanup pass: New York day start", () => {
  it("is real local midnight on the days the clocks change", () => {
    // Fall back, 2026-11-01: midnight is still EDT (UTC-4).
    assert.equal(newYorkDayStartIso(new Date("2026-11-01T15:00:00Z")), "2026-11-01T04:00:00.000Z");
    // Spring forward, 2026-03-08: midnight is still EST (UTC-5).
    assert.equal(newYorkDayStartIso(new Date("2026-03-08T15:00:00Z")), "2026-03-08T05:00:00.000Z");
  });

  it("is unchanged on ordinary days", () => {
    assert.equal(newYorkDayStartIso(new Date("2026-07-15T15:00:00Z")), "2026-07-15T04:00:00.000Z");
    assert.equal(newYorkDayStartIso(new Date("2026-01-15T15:00:00Z")), "2026-01-15T05:00:00.000Z");
  });
});

describe("cleanup pass: push icon host", () => {
  it("only uses an avatar from our own storage host", () => {
    const before = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    try {
      const own = "https://project.supabase.co/storage/v1/object/public/avatars/a.png";
      assert.equal(pushIcon(own), own);
      assert.equal(pushIcon("https://elsewhere.example/storage/v1/object/public/avatars/a.png"), FALLBACK_ICON);
    } finally {
      if (before === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = before;
    }
  });
});

describe("cleanup pass: wiring", () => {
  it("does not refetch a card's posts when unrelated social state changes", () => {
    for (const path of ["components/card-posts-list.tsx", "components/card-collectors-saying.tsx"]) {
      const source = read(path);
      // The load effect depends on the card and readiness only. Listing the
      // loaded posts re-ran it after every rememberPosts call.
      assert.doesNotMatch(source, /\}, \[cardId, loadedPosts,/, path);
      assert.match(source, /fallbackRef\.current/, path);
    }
    assert.match(read("components/card-posts-list.tsx"), /\}, \[cardId, ready, rememberPosts\]\);/);
    assert.match(read("components/card-collectors-saying.tsx"), /\}, \[cardId, ready\]\);/);
  });

  it("keeps avatars inside row links from opening the photo instead", () => {
    assert.equal(read("components/notifications-view.tsx").match(/expandable=\{false\}/g)?.length, 2);
    assert.match(read("components/follow-list.tsx"), /accent=\{person\.accent\}\s+expandable=\{false\}/);
  });

  it("attaches a card from the Home composer with its grade and parallel", () => {
    const feed = read("components/feed-view.tsx");
    assert.match(feed, /selected \? toPublicAttachment\(selected\) : null/);
  });

  it("marks a card sold on the local date, not the UTC date", () => {
    const detail = read("components/card-detail.tsx");
    assert.match(detail, /sellDate: todayDateInput\(\)/);
    assert.doesNotMatch(detail, /sellDate: new Date\(\)\.toISOString\(\)/);
  });

  it("lets the Quick Comp focus ring draw", () => {
    // outline-none sets the outline style to none on the same element, so
    // focus-visible:outline-2 never showed.
    assert.doesNotMatch(read("components/quick-comp/tokens.ts"), /outline-none/);
  });

  it("retries the server read from the route error screens", () => {
    for (const path of ["app/(app)/leaderboard/value/error.tsx", "app/(app)/p/[player]/error.tsx"]) {
      const source = read(path);
      assert.match(source, /onClick=\{\(\) => retry\(\)\}/, path);
      assert.doesNotMatch(source, /reset/, path);
    }
  });

  it("hands the snapshot write to after() as a promise", () => {
    const page = read("app/(app)/collection/page.tsx");
    assert.match(page, /after\(\(\) =>\s+upsertTodaysCollectionSnapshot\(userId\)\.catch/);
    assert.doesNotMatch(page, /void upsertTodaysCollectionSnapshot/);
  });

  it("pages whole tables in a stable order", () => {
    assert.match(read("app/api/cron/collection-snapshots/route.ts"), /\.order\("id"\)\s+\.range\(/);
    assert.match(read("lib/value/getCardValue.ts"), /\.order\(table === "cards" \? "id" : "card_id"\)\s+\.range\(/);
  });

  it("keeps taps in the report and confirm dialogs away from the post row", () => {
    assert.equal(read("components/safety-menu.tsx").match(/onClick=\{\(event\) => event\.stopPropagation\(\)\}/g)?.length, 2);
  });

  it("leaves keys on a link inside a quote to that link", () => {
    assert.match(read("components/quoted-post-embed.tsx"), /if \(event\.target !== event\.currentTarget\) return;/);
  });

  it("clears busy when a safety action never reaches the server", () => {
    assert.equal(SAFETY_ACTION_FAILED, "Something went wrong. Try again.");
    for (const path of ["components/safety-menu.tsx", "components/privacy-lists.tsx", "components/report-actions.tsx"]) {
      assert.match(read(path), /SAFETY_ACTION_FAILED/, path);
      assert.match(read(path), /\.finally\(\(\) => setBusy(Id)?\((false|null)\)\)/, path);
    }
  });

  it("rolls a hidden sale back when the request itself fails", () => {
    const flags = read("components/use-comp-flags.ts");
    assert.equal(flags.match(/\}\)\.catch\(\(\) => null\);\s+if \(!res\?\.ok\) \{/g)?.length, 2);
  });

  it("does not fail a push row over delivery bookkeeping", () => {
    assert.match(read("lib/push/dispatch.ts"), /store\.recordDelivery\(result, iso\(at\)\)\.catch\(\(\) => undefined\)/);
  });

  it("removed the components nothing rendered", () => {
    for (const path of [
      "components/card-face.tsx",
      "components/card-owners.tsx",
      "components/fair-price-check.tsx",
      "components/portfolio-context.tsx",
      "components/profit-text.tsx",
    ]) {
      assert.equal(existsSync(join(process.cwd(), path)), false, path);
    }
  });
});

describe("cleanup pass: card search words", () => {
  it("treats words that are also object property names as plain words", async () => {
    const { expandAliasTokens, parseCardQuery } = await import("@/lib/card-search-query");
    // "constructor" used to read Object.prototype.constructor as an alias and throw.
    assert.deepEqual(expandAliasTokens(["constructor", "tostring", "wemby"]).slice(0, 2), ["constructor", "tostring"]);
    assert.doesNotThrow(() => parseCardQuery("wembanyama constructor"));
  });
});
