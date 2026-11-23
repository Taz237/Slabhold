import "@/lib/test/image-env";
import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { installDom } from "@/lib/test/dom";
import { EMPTY_MEDIA } from "@/lib/landing/media";
import { FIXTURE_POSTS, STORAGE, htmlText, withLandingContexts } from "@/lib/test/landing-fixtures";

installDom();
process.env.NEXT_PUBLIC_SUPABASE_URL = new URL(STORAGE).origin;

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

async function landing(posts: unknown) {
  const { LandingPage } = await import("@/components/landing-page");
  return renderToStaticMarkup(withLandingContexts(createElement(LandingPage, { posts: posts as never, media: EMPTY_MEDIA })));
}

function post(id: string, user: string, at: string, more: Record<string, unknown> = {}) {
  return {
    id,
    user_id: user,
    content: `Post ${id}`,
    image_url: `${STORAGE}/post-images/${user}/${id}.jpg`,
    card: null,
    quoted_post_id: null,
    created_at: at,
    hidden_at: null,
    post_type: "post",
    ...more,
  };
}

const PROFILES = [
  { id: "u1", username: "first_real", display_name: "First Real", avatar_url: `${STORAGE}/avatars/u1/a.jpg`, is_test: false },
  { id: "u2", username: "second_real", display_name: "Second Real", avatar_url: null, is_test: false },
  { id: "u3", username: "third_real", display_name: "", avatar_url: "https://elsewhere.example/a.jpg", is_test: false },
  { id: "u4", username: "tester", display_name: "Tester", avatar_url: null, is_test: true },
  { id: "u5", username: "donnietaz", display_name: "Team", avatar_url: null, is_test: false },
  { id: "u6", username: "Slabhold", display_name: "Slabhold", avatar_url: null, is_test: false },
  { id: "u7", username: "slabholdupdates", display_name: "Slabhold Updates", avatar_url: null, is_test: false },
];

/*
 * The landing page shows a real timeline now: a few recent public posts,
 * read on the server. These pins keep it real: never a hidden post, never a
 * sample post or a generated avatar, and never padded up to three.
 */
describe("the landing timeline is real posts only", () => {
  it("renders three real public posts like a Home post: avatar, name, handle, text and card photo", async () => {
    const html = await landing(FIXTURE_POSTS);
    const posts = [...html.matchAll(/<li class="lp-post" data-landing-post="([^"]+)">/g)].map((match) => match[1]);
    assert.deepEqual(posts, FIXTURE_POSTS.map((item) => item.id));
    const text = htmlText(html);
    for (const item of FIXTURE_POSTS) {
      assert.ok(text.includes(`@${item.handle}`), item.handle);
      assert.ok(text.includes(item.name), item.name);
      if (item.text) assert.ok(text.includes(item.text), item.text);
      assert.ok(decodeURIComponent(html).includes(item.photoUrl), item.photoUrl);
    }
    // Every post photo is resized for its slot by the image optimizer: never the full upload.
    const photos = [...html.matchAll(/<figure class="lp-post-photo"[^>]*><img([^>]+)>/g)].map((match) => match[1]);
    assert.equal(photos.length, FIXTURE_POSTS.length);
    for (const img of photos) {
      assert.match(img, /src="\/_next\/image\?url=/);
      assert.match(img, /srcSet="[^"]*w=640&amp;q=75 640w/);
      assert.match(img, /sizes="(260px|\(min-width: 640px\) 480px, 76vw)"/);
      assert.doesNotMatch(img, /src="https:/);
    }
    assert.match(html, /<img src="[^"]*avatars\/p1\/me\.jpg" alt="" width="40" height="40" loading="lazy"/);
    assert.equal((html.match(/lp-avatar-initial/g) ?? []).length, 2, "no avatar: the initial, never a stand-in face");
    assert.match(html, /data-kind="card"[\s\S]*?<figcaption>Fixture Rookie · 2024 Fixture Set<\/figcaption>/);
    for (const img of [...html.matchAll(/<img[^>]+(post-images|card-photos)[^>]+>/g)].map((match) => match[0])) {
      assert.match(img, /loading="lazy"/);
      assert.match(img, /alt="[^"]+"/);
    }
    // The posts sit right under the hero, in the timeline section.
    assert.ok(html.indexOf('data-section="timeline"') < html.indexOf("data-landing-timeline"));
    assert.ok(html.indexOf("data-landing-timeline") < html.indexOf('data-section="profile-cards"'));
  });

  it("shows however many are real: two, one, or none, and never pads", async () => {
    for (const count of [2, 1, 0]) {
      const html = await landing(FIXTURE_POSTS.slice(0, count));
      assert.equal((html.match(/data-landing-post=/g) ?? []).length, count);
      assert.equal(html.includes("data-landing-timeline"), count > 0);
      assert.match(htmlText(html), /A timeline that's only cards\./);
    }
  });

  it("picks the newest three with a photo, one per collector first", async () => {
    const { landingTimeline } = await import("@/lib/landing/timeline");
    const rows = [
      post("a1", "u1", "2026-11-20T10:00:00Z"),
      post("a2", "u1", "2026-11-20T09:00:00Z"),
      post("b1", "u2", "2026-11-19T10:00:00Z"),
      post("c1", "u3", "2026-11-18T10:00:00Z"),
      post("a3", "u1", "2026-11-17T10:00:00Z"),
    ];
    const picked = landingTimeline(rows, PROFILES, []);
    assert.deepEqual(picked.map((item) => item.id), ["a1", "b1", "c1"]);
    assert.deepEqual(picked.map((item) => item.handle), ["first_real", "second_real", "third_real"]);
    assert.equal(picked[0].avatarUrl, `${STORAGE}/avatars/u1/a.jpg`);
    assert.equal(picked[2].avatarUrl, null, "an off-site avatar is dropped");
    assert.equal(picked[2].name, "third_real", "no display name: the handle");
    // Two collectors only: the second post of one fills the third place.
    assert.deepEqual(landingTimeline(rows.filter((row) => row.user_id !== "u3"), PROFILES, []).map((item) => item.id), ["a1", "a2", "b1"]);
    // Fewer than three real posts: just those.
    assert.deepEqual(landingTimeline(rows.slice(2, 4), PROFILES, []).map((item) => item.id), ["b1", "c1"]);
    assert.deepEqual(landingTimeline([], PROFILES, []), []);
  });

  it("never shows a hidden post, even if a read handed one over", async () => {
    const { landingTimeline } = await import("@/lib/landing/timeline");
    const rows = [
      post("hidden", "u1", "2026-11-21T10:00:00Z", { hidden_at: "2026-11-21T11:00:00Z", content: "Hidden words" }),
      post("seen", "u2", "2026-11-20T10:00:00Z"),
    ];
    const picked = landingTimeline(rows, PROFILES, []);
    assert.deepEqual(picked.map((item) => item.id), ["seen"]);
    const html = await landing(picked);
    assert.doesNotMatch(html, /Hidden words|data-landing-post="hidden"/);
    // And the read itself asks only for posts that are not hidden, as a logged-out visitor.
    const load = read("lib/landing/timeline-load.ts");
    assert.match(load, /\.from\("posts"\)\s*\.select\(LANDING_POST_SELECT\)\s*\.is\("hidden_at", null\)/);
    assert.match(load, /\.or\("image_url\.not\.is\.null,card\.not\.is\.null"\)/, "only posts that can have a card photo");
    assert.match(load, /const supabase = anonClient\(\);/);
    assert.doesNotMatch(load, /service_role|SERVICE_ROLE|createServiceClient/);
  });

  it("leaves out test accounts, the team accounts, Quick Comp posts, quotes, pickups piles, unknown authors and posts with no stored photo", async () => {
    const { landingTimeline } = await import("@/lib/landing/timeline");
    const rows = [
      post("test", "u4", "2026-11-21T10:00:00Z"),
      post("team", "u5", "2026-11-21T09:00:00Z"),
      post("brand", "u6", "2026-11-21T08:50:00Z"),
      post("updates", "u7", "2026-11-21T08:40:00Z"),
      post("comp1", "u1", "2026-11-21T08:30:00Z", { content: "Try Quick Comp on this one" }),
      post("comp2", "u2", "2026-11-21T08:20:00Z", { content: "quickcomp says $40" }),
      post("comp3", "u3", "2026-11-21T08:10:00Z", { content: "QUICK  COMP is gone?" }),
      post("quote", "u1", "2026-11-21T08:00:00Z", { quoted_post_id: "other" }),
      post("pile", "u1", "2026-11-21T07:00:00Z", { post_type: "mail_day" }),
      post("ghost", "nobody", "2026-11-21T06:00:00Z"),
      post("words", "u1", "2026-11-21T05:00:00Z", { image_url: null }),
      post("inline", "u1", "2026-11-21T04:00:00Z", { image_url: "data:image/png;base64,AAAA" }),
      post("offsite", "u1", "2026-11-21T03:00:00Z", { image_url: "https://elsewhere.example/x.jpg" }),
      post("ok", "u2", "2026-11-21T02:00:00Z"),
    ];
    assert.deepEqual(landingTimeline(rows, PROFILES, []).map((item) => item.id), ["ok"]);
  });

  it("draws an attached card only while that card is public, with its own details", async () => {
    const { landingTimeline } = await import("@/lib/landing/timeline");
    const cardId = "44444444-4444-4444-8444-444444444444";
    const rows = [post("card", "u2", "2026-11-21T10:00:00Z", { image_url: null, card: { id: cardId, photoDataUrl: `${STORAGE}/card-photos/u2/old.jpg` } })];
    assert.deepEqual(landingTimeline(rows, PROFILES, []), [], "the card went private: its saved photo is not used");
    const [shown] = landingTimeline(rows, PROFILES, [
      { id: cardId, player: "Fixture Rookie", year: 2024, year_label: null, set: "Fixture Set", image_url: `${STORAGE}/card-photos/u2/now.jpg` },
    ]);
    assert.equal(shown.photoUrl, `${STORAGE}/card-photos/u2/now.jpg`);
    assert.equal(shown.photoKind, "card");
    assert.equal(shown.cardLabel, "Fixture Rookie · 2024 Fixture Set");
  });

  it("reads posts, their authors and their public cards, and a failed read draws no posts", async () => {
    const { readLandingTimeline, landingTimelinePosts } = await import("@/lib/landing/timeline-load");
    const asked: string[] = [];
    const answers: Record<string, unknown> = {
      posts: [post("a1", "u1", "2026-11-20T10:00:00Z"), post("b1", "u2", "2026-11-19T10:00:00Z")],
      profiles: PROFILES,
      public_cards: [],
    };
    const client = {
      from(table: string) {
        asked.push(table);
        const chain: Record<string, unknown> = {};
        for (const name of ["select", "is", "in", "or", "lt", "order", "limit"]) chain[name] = () => chain;
        chain.returns = async () => ({ data: answers[table], error: null });
        return chain;
      },
    } as unknown as SupabaseClient;
    assert.deepEqual((await readLandingTimeline(client)).map((item) => item.id), ["a1", "b1"]);
    assert.deepEqual(asked, ["posts", "profiles"], "no attached cards, so no card read");

    const broken = {
      from() {
        const chain: Record<string, unknown> = {};
        for (const name of ["select", "is", "in", "or", "lt", "order", "limit"]) chain[name] = () => chain;
        chain.returns = async () => ({ data: null, error: { message: "down" } });
        return chain;
      },
    } as unknown as SupabaseClient;
    await assert.rejects(() => readLandingTimeline(broken), /landing posts read failed: down/);
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.deepEqual(await landingTimelinePosts(() => readLandingTimeline(broken)), []);
    } finally {
      console.warn = warn;
    }
    const load = read("lib/landing/timeline-load.ts");
    assert.match(load, /unstable_cache\(loadLandingTimeline, \["landing-timeline"\], \{ revalidate: 1800 \}\)/);
    assert.match(load, /^import "server-only";/);
  });

  it("fills from older posts when fewer than three of the newest fit, and stops once three do", async () => {
    const { readLandingTimeline } = await import("@/lib/landing/timeline-load");
    const { LANDING_POST_SCAN } = await import("@/lib/landing/timeline");
    // Page 1: a full page where only one post fits. Page 2: older posts, two of which fit. Page 3 is never read.
    const day = (n: number) => new Date(Date.UTC(2026, 10, 20) - n * 3_600_000).toISOString();
    const pageOne = Array.from({ length: LANDING_POST_SCAN }, (_, i) => post(`new${i}`, i === 0 ? "u1" : "u4", day(i)));
    const pageTwo = [post("old1", "u2", day(100)), post("old2", "u3", day(101)), post("old3", "u2", day(102))];
    const pages = [pageOne, pageTwo, [post("older", "u1", day(500))]];
    const cursors: (string | null)[] = [];
    let reads = 0;
    const client = {
      from(table: string) {
        let cursor: string | null = null;
        const chain: Record<string, unknown> = {};
        for (const name of ["select", "is", "in", "or", "order", "limit"]) chain[name] = () => chain;
        chain.lt = (_column: string, value: string) => {
          cursor = value;
          return chain;
        };
        chain.returns = async () => {
          if (table !== "posts") return { data: table === "profiles" ? PROFILES : [], error: null };
          cursors.push(cursor);
          return { data: pages[reads++] ?? [], error: null };
        };
        return chain;
      },
    } as unknown as SupabaseClient;
    const picked = await readLandingTimeline(client);
    assert.deepEqual(picked.map((item) => item.id), ["new0", "old1", "old2"]);
    assert.equal(reads, 2, "it stops as soon as three fit");
    assert.deepEqual(cursors, [null, pageOne[pageOne.length - 1].created_at], "the second read starts where the first ended");
  });

  it("keeps reading back only so far, and returns what is real when the posts run out", async () => {
    const { readLandingTimeline } = await import("@/lib/landing/timeline-load");
    const { LANDING_POST_PAGES, LANDING_POST_SCAN } = await import("@/lib/landing/timeline");
    let reads = 0;
    const client = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        for (const name of ["select", "is", "in", "or", "lt", "order", "limit"]) chain[name] = () => chain;
        chain.returns = async () => {
          if (table !== "posts") return { data: table === "profiles" ? PROFILES : [], error: null };
          reads += 1;
          // Every page is full of a test account's posts: nothing ever fits.
          return { data: Array.from({ length: LANDING_POST_SCAN }, (_, i) => post(`p${reads}-${i}`, "u4", new Date(Date.UTC(2026, 0, 1) - (reads * 100 + i) * 60_000).toISOString())), error: null };
        };
        return chain;
      },
    } as unknown as SupabaseClient;
    assert.deepEqual(await readLandingTimeline(client), []);
    assert.equal(reads, LANDING_POST_PAGES);
  });

  it("on /welcome a failed read throws in production, so the last good timeline stays up; a build or a laptop draws no posts", async () => {
    const { welcomeTimelinePosts } = await import("@/lib/landing/timeline-load");
    const fail = () => Promise.reject(new Error("down"));
    const warn = console.warn;
    console.warn = () => {};
    try {
      await assert.rejects(() => welcomeTimelinePosts(fail, undefined, "production"), /down/);
      assert.deepEqual(await welcomeTimelinePosts(fail, "phase-production-build", "production"), []);
      assert.deepEqual(await welcomeTimelinePosts(fail, undefined, "development"), []);
      assert.deepEqual(await welcomeTimelinePosts(async () => FIXTURE_POSTS, undefined, "production"), FIXTURE_POSTS);
    } finally {
      console.warn = warn;
    }
  });

  it("skips a post whose text has a word from the landing list, and keeps card names that only look like one", async () => {
    const { landingTimeline } = await import("@/lib/landing/timeline");
    const { LANDING_BLOCKED_WORDS, landingTextBlocked } = await import("@/lib/landing/blocked-words");
    assert.ok(LANDING_BLOCKED_WORDS.length >= 20);
    for (const word of LANDING_BLOCKED_WORDS) {
      assert.equal(word, word.toLowerCase().trim(), word);
      assert.equal(landingTextBlocked(`Look at this ${word} card`), true, word);
    }
    for (const text of ["What the F*CK", "this is sh1t", "Total BULLSHIT.", "a$$hole seller"]) {
      assert.equal(landingTextBlocked(text.replace("F*CK", "FUCK")), true, text);
    }
    for (const fine of ["Eric Dickerson rookie", "Matt Cassel auto", "Dick Butkus PSA 8", "Hancock 1/1", "Classic set, glass case", "Assists leader", ""]) {
      assert.equal(landingTextBlocked(fine), false, fine);
    }
    // The app's own filter (slurs, explicit terms, threats) counts too.
    const { BLOCKED_ENTRIES } = await import("@/lib/safety/content-filter");
    const first = BLOCKED_ENTRIES[0];
    assert.equal(landingTextBlocked(`a ${typeof first === "string" ? first : first.word} post`), true);

    const rows = [
      post("rude", "u1", "2026-11-21T10:00:00Z", { content: "this pack was shit" }),
      post("clean", "u2", "2026-11-20T10:00:00Z", { content: "Eric Dickerson rookie, finally" }),
    ];
    assert.deepEqual(landingTimeline(rows, PROFILES, []).map((item) => item.id), ["clean"]);
    // A rude display name keeps the post off too.
    const rudeName = PROFILES.map((profile) => (profile.id === "u2" ? { ...profile, display_name: "Shit Poster" } : profile));
    assert.deepEqual(landingTimeline(rows, rudeName, []), []);
    // One file holds the list.
    const source = read("lib/landing/blocked-words.ts");
    assert.match(source, /export const LANDING_BLOCKED_WORDS: readonly string\[\] = \[/);
    assert.doesNotMatch(read("lib/landing/timeline.ts"), /"fuck"|"shit"/);
  });

  it("draws no made-up account: no persona name, handle or avatar, and no sample post", async () => {
    const html = await landing(FIXTURE_POSTS);
    const { PERSONAS } = await import("@/components/landing/showcase/sample-data");
    for (const persona of Object.values(PERSONAS)) {
      assert.ok(!html.includes(persona.handle), persona.handle);
      assert.ok(!html.includes(persona.name), persona.name);
    }
    assert.doesNotMatch(html, /\/landing\/avatars\//);
    assert.doesNotMatch(htmlText(html), /Sample accounts|not real collectors|Collectors talking cards|Weekly leaderboards/);
    const handles = [...htmlText(html).matchAll(/@([a-z0-9_]+)/g)].map((match) => match[1]);
    assert.deepEqual(handles, FIXTURE_POSTS.map((item) => item.handle), "only the handles of the real posts");
  });

  it("no landing source reaches for the personas, the avatars, the old demos or the signed-in timeline", () => {
    const files = readdirSync(join(ROOT, "components/landing"))
      .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
      .map((name) => `components/landing/${name}`);
    for (const file of [...files, "components/landing-page.tsx", "app/welcome/page.tsx", "app/(app)/page.tsx", "lib/landing/timeline.ts", "lib/landing/timeline-load.ts"]) {
      assert.doesNotMatch(read(file), /avatarSrc|PERSONAS|SAMPLE_POSTS|SAMPLE_BOARD|landing\/avatars|timeline-demo|leaderboard-demo|LandingPickupContext/, file);
    }
    for (const file of [...files, "components/landing-page.tsx"]) {
      assert.doesNotMatch(read(file), /social-provider|home-feed|feed-view|post-view|composer|use-paged-timeline|@supabase\/supabase-js/, file);
    }
    for (const gone of ["timeline-demo.tsx", "leaderboard-demo.tsx"]) {
      assert.equal(existsSync(join(ROOT, "components/landing/showcase", gone)), false, gone);
    }
  });
});
