import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrustLineView, vouchesHref } from "@/components/vouches/trust-line";
import { RatingChip, VouchesEmpty, VouchRowItem, VouchSummaryCard, VouchTabs } from "@/components/vouches/vouches-page";
import { VouchesPageSkeleton } from "@/components/vouches/vouches-skeleton";
import {
  breakdownShares,
  filterCount,
  filterFromParam,
  filterHref,
  joinedLabel,
  lastVouchLabel,
  percentLabel,
  vouchAnchorId,
  voucherMeta,
  vouchIdFromHash,
} from "@/lib/vouches/page";
import { emptySummary, VOUCH_COPY, type VouchSummary } from "@/lib/vouches/rules";
import { vouchHref } from "@/lib/vouches/links";
import { notificationHref } from "@/lib/social/notification-href";
import type { VouchRow } from "@/lib/vouches/types";

const NOW = new Date("2026-11-28T12:00:00Z");
const VOUCH = "00000000-0000-4000-8000-000000000050";

const summary = (positive: number, neutral = 0, negative = 0, extra: Partial<VouchSummary> = {}): VouchSummary => ({
  ...emptySummary("u1"),
  total: positive + neutral + negative,
  positive,
  neutral,
  negative,
  lastVouchAt: "2026-11-25T12:00:00Z",
  ...extra,
});

const row = (extra: Partial<VouchRow> = {}): VouchRow => ({
  id: VOUCH,
  rating: "positive",
  note: "Shipped fast, card as shown.",
  createdAt: "2026-11-25T12:00:00Z",
  editedAt: null,
  reply: null,
  replyAt: null,
  replyEditedAt: null,
  voucher: { id: "kev", username: "kevpulls", displayName: "Kev Marlow", avatarUrl: null, accent: "#22c55e", createdAt: "2026-10-03T00:00:00Z", vouchTotal: 8 },
  hasLoggedDeal: false,
  ...extra,
});
const subject = { id: "u1", username: "waxroom" };

const html = (element: ReactElement) => renderToStaticMarkup(element);
const text = (element: ReactElement) => html(element).replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
/** The same, with a space wherever a tag was: for checking what follows what across blocks. */
const spaced = (element: ReactElement) => html(element).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("trust line", () => {
  it("shows the count and the percent, and links to the vouches page", () => {
    const line = createElement(TrustLineView, { summary: summary(14), href: vouchesHref("kev") });
    assert.equal(text(line), "14 vouches · 100% positive");
    assert.match(html(line), /href="\/u\/kev\/vouches"/);
    assert.equal(text(createElement(TrustLineView, { summary: summary(1), href: "/u/kev/vouches" })), "1 vouch");
    assert.equal(text(createElement(TrustLineView, { summary: summary(2), href: "/u/kev/vouches" })), "2 vouches");
    assert.equal(text(createElement(TrustLineView, { summary: summary(249, 0, 1), href: "/u/kev/vouches" })), "250 vouches · 99% positive");
  });

  it("says No vouches yet, still as a link, when there are none", () => {
    const line = createElement(TrustLineView, { summary: summary(0), href: "/u/kev/vouches" });
    assert.equal(text(line), "No vouches yet");
    assert.match(html(line), /<a[^>]+href="\/u\/kev\/vouches"/);
    assert.doesNotMatch(html(line), /<svg/);
  });

  it("is a 44px tap target with a purple check, never teal, and no emoji check", () => {
    const markup = html(createElement(TrustLineView, { summary: summary(14), href: "/u/kev/vouches" }));
    assert.match(markup, /min-h-11/);
    assert.match(markup, /text-violet-600/);
    assert.match(markup, /dark:text-\[#A78BFA\]/);
    assert.match(markup, /<svg[^>]+aria-hidden="true"/);
    assert.doesNotMatch(markup, /✓|teal|cyan|emerald/);
  });

  it("draws nothing until vouches are supported, and holds its height while that is found out", () => {
    const source = read("components/vouches/trust-line.tsx");
    assert.match(source, /if \(!supported && !pending\) return null;/);
    assert.match(source, /skeleton-shimmer/);
    // Only the small core, never the copy or the note checks: this ships with every profile.
    assert.doesNotMatch(source, /lib\/vouches\/(rules|store|remote|local|page)"/);
    assert.match(source, /from "@\/lib\/vouches\/core"/);
    // What a profile loads for it: the core, the gate and the small summary store. The full store
    // (saving, statuses), the copy, the note checks and the backends all load later, where needed.
    for (const file of ["lib/vouches/core.ts", "lib/vouches/summary-store.ts", "lib/vouches/support.ts", "components/use-vouch-summary.ts"]) {
      assert.doesNotMatch(read(file), /^import (?!type)[^;]*from "(\.\/|@\/lib\/vouches\/|@\/components\/)(rules|remote|local|page|store|use-vouch-store)";/m, `${file} stays small`);
    }
    assert.doesNotMatch(read("lib/vouches/store.ts"), /^import (?!type)[^;]*from "\.\/(rules|remote|local|page)";/m, "the store loads the note checks lazily");
  });

  it("sits under the counts row on every profile, own and others", () => {
    const profile = read("components/profile-view.tsx");
    assert.match(profile, /label="Following"\s*\/>\s*<\/div>\s*<TrustLine userId=\{profile\.id\} username=\{profile\.username\} \/>/);
  });
});

describe("vouches page pieces", () => {
  it("summary card: the count, the percent once 3 are rated, the breakdown and the last vouch", () => {
    const card = spaced(createElement(VouchSummaryCard, { summary: summary(12, 2, 0), now: NOW }));
    assert.match(card, /^14 vouches 100% positive 12 positive · 2 neutral · 0 negative Last vouch 3d ago/);
    assert.match(card, /How vouches work/);
    assert.ok(card.includes(VOUCH_COPY.pageFootnote));
    const few = spaced(createElement(VouchSummaryCard, { summary: summary(2, 1, 0), now: NOW }));
    assert.match(few, /^3 vouches 2 positive · 1 neutral · 0 negative/);
    assert.doesNotMatch(few, /%/);
    assert.match(spaced(createElement(VouchSummaryCard, { summary: summary(1), now: NOW })), /^1 vouch /);
  });

  it("summary card: social proof only when the reader follows a voucher, and nothing odd at zero", () => {
    const followed = summary(5, 0, 0, { followedCount: 3, followedSampleUsername: "kev" });
    assert.match(spaced(createElement(VouchSummaryCard, { summary: followed, now: NOW })), /Vouched by @kev and 2 others you follow/);
    // No vouches: no wall of zeros, just how it works, already open.
    const none = spaced(createElement(VouchSummaryCard, { summary: { ...emptySummary("u1") }, now: NOW }));
    assert.match(none, /^How vouches work You can vouch for someone/);
    assert.doesNotMatch(none, /Last vouch|Vouched by|NaN|0 positive|\b0\b/);
    assert.match(html(createElement(VouchSummaryCard, { summary: { ...emptySummary("u1") }, now: NOW })), /<details open=""/);
    assert.doesNotMatch(html(createElement(VouchSummaryCard, { summary: summary(3), now: NOW })), /<details open/);
  });

  it("the bar is purple for positive and grey for the rest: red is only the thumbs-down icon", () => {
    const card = html(createElement(VouchSummaryCard, { summary: summary(12, 2, 1), now: NOW }));
    assert.match(card, /bg-violet-600/);
    assert.match(card, /bg-zinc-400/);
    assert.match(card, /bg-zinc-600/);
    assert.doesNotMatch(card, /rose|red-|teal|emerald|green-/);
    const chip = html(createElement(RatingChip, { rating: "negative" }));
    assert.match(chip, /<svg[^>]+text-rose-600/);
    assert.doesNotMatch(chip.replace(/<svg[\s\S]*?<\/svg>/, ""), /rose/);
    assert.doesNotMatch(html(createElement(RatingChip, { rating: "positive" })), /rose/);
    assert.deepEqual(breakdownShares(summary(3, 1, 0)).map((share) => [share.rating, share.percent]), [["positive", 75], ["neutral", 25]]);
    assert.deepEqual(breakdownShares(emptySummary("u1")), []);
  });

  it("tabs: four 44px tabs with everyone's counts, and the chosen one selected", () => {
    const tabs = html(createElement(VouchTabs, { filter: "neutral", summary: summary(12, 2, 0), onChange: () => {} }));
    assert.equal((tabs.match(/role="tab"/g) ?? []).length, 4);
    assert.equal((tabs.match(/min-h-11/g) ?? []).length, 4);
    assert.equal((tabs.match(/aria-selected="true"/g) ?? []).length, 1);
    assert.match(tabs, /aria-selected="true"[^>]*>.*?Neutral/);
    assert.equal(text(createElement(VouchTabs, { filter: "all", summary: summary(12, 2, 0), onChange: () => {} })), "All14Positive12Neutral2Negative0");
    assert.equal(text(createElement(VouchTabs, { filter: "all", summary: null, onChange: () => {} })), "AllPositiveNeutralNegative", "no counts until they load");
    assert.match(tabs, /translateX\(200%\)/);
    assert.match(tabs, /motion-reduce:transition-none/);
  });

  it("a row: who, when, the rating, the note, and an anchor the admin link and notices can land on", () => {
    const markup = html(createElement(VouchRowItem, { row: row(), subject, now: NOW, showMenus: false }));
    assert.match(markup, new RegExp(`<li id="vouch-${VOUCH}"`));
    assert.match(markup, /scroll-mt-20/);
    assert.equal((markup.match(/href="\/u\/kevpulls"/g) ?? []).length, 2, "the avatar and the name link to the voucher");
    assert.equal(text(createElement(VouchRowItem, { row: row(), subject, now: NOW, showMenus: false })), "KMKev Marlow@kevpulls · 3dPositiveShipped fast, card as shown.8 vouches · joined Oct 2026");
  });

  it("a row: Edited, Logged deal, and the subject's reply under it", () => {
    const full = spaced(
      createElement(VouchRowItem, {
        row: row({ rating: "negative", note: "Corner ding.\nNot in the photos.", editedAt: "2026-11-26T00:00:00Z", hasLoggedDeal: true, reply: "Refunded the difference.", replyAt: "2026-11-26T01:00:00Z", replyEditedAt: "2026-11-26T02:00:00Z" }),
        subject,
        now: NOW,
        showMenus: false,
      }),
    );
    assert.match(full, /Negative/);
    assert.match(full, /Logged deal Edited 8 vouches · joined Oct 2026/);
    assert.match(full, /Reply from @waxroom · Edited Refunded the difference\./);
    const plain = text(createElement(VouchRowItem, { row: row({ note: "" }), subject, now: NOW, showMenus: false }));
    assert.doesNotMatch(plain, /Edited|Logged deal|Reply from/);
    assert.match(html(createElement(VouchRowItem, { row: row({ note: "Line one.\nLine two." }), subject, now: NOW, showMenus: false })), /whitespace-pre-line/);
  });

  it("a row: never a price, never 0 vouches under a name, and a missing join date is just left out", () => {
    assert.equal(voucherMeta(8, "2026-10-03T00:00:00Z"), "8 vouches · joined Oct 2026");
    assert.equal(voucherMeta(1, null), "1 vouch");
    assert.equal(voucherMeta(0, "2026-10-03T00:00:00Z"), "joined Oct 2026");
    assert.equal(voucherMeta(0, null), "");
    assert.equal(joinedLabel("not a date"), "");
    const markup = html(createElement(VouchRowItem, { row: row({ hasLoggedDeal: true }), subject, now: NOW, showMenus: false }));
    assert.doesNotMatch(markup, /\$|price/i);
  });

  it("a row carries a report menu for the vouch, and one for the reply", () => {
    const source = read("components/vouches/vouches-page.tsx");
    assert.match(source, /<SafetyMenu targetType="vouch" targetId=\{row\.id\} reportedUserId=\{voucher\.id\} username=\{voucher\.username\} \/>/);
    assert.match(source, /<SafetyMenu targetType="vouch_reply" targetId=\{row\.id\} reportedUserId=\{subject\.id\} username=\{subject\.username\} \/>/);
  });

  it("the highlighted row (from a link) is tinted purple and settles without motion when asked", () => {
    const markup = html(createElement(VouchRowItem, { row: row(), subject, now: NOW, highlighted: true, showMenus: false }));
    assert.match(markup, /data-highlighted=""/);
    assert.match(markup, /bg-violet-600\/\[0\.07\]/);
    assert.match(markup, /motion-reduce:transition-none/);
    assert.match(read("components/vouches/vouches-page.tsx"), /prefers-reduced-motion: reduce/);
  });

  it("empty states are designed, and differ for others, yourself, a filter, and vouches you can't see", () => {
    const empty = (props: Parameters<typeof VouchesEmpty>[0]) => spaced(createElement(VouchesEmpty, props));
    assert.equal(empty({ filter: "all", own: false, username: "kev", hiddenFromReader: false }), "No vouches yet Vouches come from people @kev has messaged with about a deal.");
    assert.equal(empty({ filter: "all", own: true, username: "kev", hiddenFromReader: false }), "No vouches yet After a deal, the other collector can vouch for you from your chat.");
    assert.equal(empty({ filter: "negative", own: false, username: "kev", hiddenFromReader: false }), "No negative vouches");
    assert.equal(empty({ filter: "neutral", own: true, username: "kev", hiddenFromReader: false }), "No neutral vouches");
    // The count says 5 but the reader gets none (a block): never "No vouches yet".
    assert.equal(empty({ filter: "all", own: false, username: "kev", hiddenFromReader: true }), `${VOUCH_COPY.emptyHiddenTitle} ${VOUCH_COPY.emptyHidden}`);
    assert.match(html(createElement(VouchesEmpty, { filter: "all", own: false, username: "kev", hiddenFromReader: false })), /<svg/);
  });

  it("the loading frame is skeletons, not a spinner", () => {
    const frame = html(createElement(VouchesPageSkeleton));
    assert.match(frame, /skeleton-shimmer/);
    assert.match(frame, /role="status"/);
    assert.doesNotMatch(frame, /animate-spin/);
    assert.match(read("app/(app)/u/[username]/vouches/loading.tsx"), /VouchesPageSkeleton/);
  });
});

describe("deals between collectors, in the Terms", () => {
  it("the Terms say, in plain words, what Slabhold does and doesn't do in a deal", async () => {
    const { default: TermsPage } = await import("@/app/(app)/terms/page");
    const markup = html(createElement(TermsPage));
    const section = /<h2 id="deals"[^>]*>([^<]+)<\/h2>([\s\S]*?)<h2/.exec(markup);
    assert.ok(section, "a section with the #deals anchor");
    assert.equal(section[1], "Deals between collectors");
    const words = section[2]!.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
    // The four things it has to say.
    assert.match(words, /doesn't sell cards, handle payments(,)? or check deals/);
    assert.match(words, /only between (you and the other collector|the two of you)/);
    assert.match(words, /isn't a party to it/);
    assert.match(words, /isn't responsible for/);
    assert.match(words, /Vouches are (collectors'|users') own opinions/);
    assert.match(words, /payment method with buyer protection/);
    // Short and plain, like the rest of the page.
    assert.ok(words.split(/(?<=[.])\s+/).length <= 6, words);
    assert.doesNotMatch(words, /hereby|herein|notwithstanding|shall|indemnif|\bbest\b|\bfree\b|verif|!/i);
    assert.match(markup, /scroll-mt-/, "the anchor clears the app header");
  });

  it("How vouches work links to that section", () => {
    const card = html(createElement(VouchSummaryCard, { summary: summary(3), now: NOW }));
    assert.match(card, /<a[^>]+href="\/terms#deals"[^>]*>[^<]*Terms[^<]*<\/a>/);
    assert.match(/<a[^>]+href="\/terms#deals"[^>]*>|<a[^>]+>(?=[^<]*Terms)/.exec(card)?.[0] ?? "", /min-h-11/);
    const none = html(createElement(VouchSummaryCard, { summary: { ...emptySummary("u1") }, now: NOW }));
    assert.match(none, /href="\/terms#deals"/, "also when there are no vouches yet");
    assert.equal(VOUCH_COPY.termsLink, "Deals between collectors, in our Terms");
  });
});

describe("vouches page plumbing", () => {
  it("reads ?rating= so a filtered page can be shared", () => {
    assert.equal(filterFromParam("negative"), "negative");
    assert.equal(filterFromParam("neutral"), "neutral");
    assert.equal(filterFromParam(null), "all");
    assert.equal(filterFromParam("all"), "all");
    assert.equal(filterFromParam("great"), "all");
    assert.equal(filterHref("/u/kev/vouches", "all"), "/u/kev/vouches");
    assert.equal(filterHref("/u/kev/vouches", "negative"), "/u/kev/vouches?rating=negative");
  });

  it("anchors match what the admin link and the vouch notices open", () => {
    assert.equal(vouchAnchorId(VOUCH), `vouch-${VOUCH}`);
    assert.equal(vouchIdFromHash(`#vouch-${VOUCH}`), VOUCH);
    assert.equal(vouchIdFromHash(`vouch-${VOUCH}`), VOUCH);
    for (const bad of ["", "#", "#vouch-", "#post-1", "#vouch-<script>", null, undefined]) assert.equal(vouchIdFromHash(bad), null, String(bad));
    const adminLink = vouchHref("waxroom", VOUCH);
    assert.equal(adminLink, `/u/waxroom/vouches#vouch-${VOUCH}`);
    assert.equal(vouchIdFromHash(adminLink.slice(adminLink.indexOf("#"))), VOUCH);
    const notice = notificationHref({ kind: "vouch", postId: null, storedHref: "/u/waxroom/vouches", vouchId: VOUCH });
    assert.equal(vouchIdFromHash(notice.slice(notice.indexOf("#"))), VOUCH);
    assert.equal(vouchesHref("@waxroom"), "/u/waxroom/vouches");
  });

  it("tab counts are everyone's; they are never checked against the rows", () => {
    assert.equal(filterCount(summary(12, 2, 1), "all"), 15);
    assert.equal(filterCount(summary(12, 2, 1), "negative"), 1);
    assert.equal(filterCount(null, "all"), null);
    const source = read("components/vouches/vouches-page.tsx");
    assert.doesNotMatch(source, /rows\.length\s*(===|!==|<|>)\s*summary/);
    assert.doesNotMatch(source, /summary\??\.total\s*(===|!==)\s*[a-z.]*rows/);
  });

  it("labels read naturally", () => {
    assert.equal(lastVouchLabel("2026-11-25T12:00:00Z", NOW), "Last vouch 3d ago");
    assert.equal(lastVouchLabel("2026-11-28T11:59:50Z", NOW), "Last vouch just now");
    assert.equal(lastVouchLabel("2026-11-28T09:00:00Z", NOW), "Last vouch 3h ago");
    assert.equal(lastVouchLabel(null, NOW), "");
    assert.equal(percentLabel(summary(3, 0, 1)), "75% positive");
    assert.equal(percentLabel(summary(2, 5, 0)), null);
    assert.equal(joinedLabel("2026-10-03T00:00:00Z"), "joined Oct 2026");
  });

  it("the route is public, a missing profile is a 404, and the title names the person", () => {
    const page = read("app/(app)/u/[username]/vouches/page.tsx");
    assert.match(page, /await requireProfile\(name\);/);
    assert.match(page, /VOUCH_COPY\.pageMetaTitle/);
    assert.doesNotMatch(page, /getAuthUserId|redirect\(/);
    assert.equal(VOUCH_COPY.pageMetaTitle("kev"), "Vouches for @kev");
  });

  it("never sends the handle to analytics: the page is logged by its pattern", async () => {
    const { scrubAnalyticsUrl } = await import("@/lib/analytics");
    assert.equal(scrubAnalyticsUrl({ type: "pageview", url: "/u/kevpulls/vouches?rating=negative" })?.url, "/u/[username]/vouches");
  });

  it("the page view is its own chunk, behind the gate, with skeletons and a retry", () => {
    const route = read("components/vouches/vouches-route.tsx");
    assert.match(route, /lazyPart<\{ username: string \}>\(\s*\(\) => import\("@\/components\/vouches\/vouches-page"\)/);
    assert.match(route, /VouchesPageSkeleton/);
    assert.match(route, /failed: PartLoadFailed/);
    const view = read("components/vouches/vouches-page.tsx");
    assert.match(view, /if \(!profile \|\| !supported\)/);
    assert.match(view, /pending\) return <VouchesPageSkeleton \/>/);
    assert.match(view, /<LoadMore hasMore=\{Boolean\(current\.next\)\}/);
    assert.match(view, /<ReadRetry/);
    assert.doesNotMatch(view, /animate-spin|animate-pulse|animate-ping|transition-all/);
  });
});
