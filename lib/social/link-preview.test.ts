import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reachableImage, renderProfileOg } from "../../components/og-frame";
import { mailDayOgTitle } from "./mail-day-copy";
import {
  cardLinkPreview,
  cardOgImagePath,
  cleanImageUrl,
  clipText,
  postLinkPreview,
  postPreviewImage,
  previewMetadata,
  profileLinkPreview,
  withCardOgImage,
} from "./link-preview";

const SECRET = "Victor Secret";
const VALUE = "$9,999";
const PHOTO = "https://cdn.example/private.jpg";
const SUPABASE_ORIGIN = "https://project.supabase.co";
const STORAGE_IMAGE = `${SUPABASE_ORIGIN}/storage/v1/object/public/card-photos/user/card.jpg`;
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;

describe("card link previews", () => {
  it("shows the name, photo, and value of a public card", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const preview = cardLinkPreview({
      isPublic: true,
      name: "2023 Prizm Victor Wembanyama #136 PSA 10",
      imageUrl: STORAGE_IMAGE,
      valueLabel: "$185",
    });
    assert.equal(preview.title, "2023 Prizm Victor Wembanyama #136 PSA 10");
    assert.match(preview.description, /\$185/);
    assert.equal(preview.imageUrl, STORAGE_IMAGE);
    assert.equal(preview.detail, "$185");
  });

  it("drops the name, photo, and value when the card is private", () => {
    const preview = cardLinkPreview({
      isPublic: false,
      name: SECRET,
      imageUrl: PHOTO,
      valueLabel: VALUE,
    });
    const packed = JSON.stringify(preview);
    assert.equal(packed.includes(SECRET), false);
    assert.equal(packed.includes(VALUE), false);
    assert.equal(packed.includes("private.jpg"), false);
    assert.equal(preview.imageUrl, null);
    assert.equal(preview.detail, "");
    assert.equal(preview.title, "Private card");
  });

  it("rejects non-https images", () => {
    const preview = cardLinkPreview({
      isPublic: true,
      name: "Card",
      imageUrl: "http://cdn.example/card.jpg",
      valueLabel: "$10",
    });
    assert.equal(preview.imageUrl, null);
  });
});

function loneSurrogate(value: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
}

describe("clipText", () => {
  it("keeps an emoji, a flag, and a combining mark that sit on the cut", () => {
    const emoji = "😀";
    const flag = "🇺🇸";
    const mark = "e\u0301";
    assert.equal(emoji.length, 2);
    const prefix = "a".repeat(88);
    for (const grapheme of [emoji, flag, mark]) {
      const clipped = clipText(`${prefix}${grapheme}zzzz`, 90);
      assert.equal(clipped, `${prefix}${grapheme}…`);
      assert.equal(clipped.includes("\uFFFD"), false);
      assert.equal(loneSurrogate(clipped), false);
    }

    const intl = Intl as { Segmenter?: typeof Intl.Segmenter };
    const original = intl.Segmenter;
    intl.Segmenter = undefined;
    try {
      assert.equal(clipText(`${prefix}${emoji}zzzz`, 90), `${prefix}${emoji}…`);
      assert.equal(loneSurrogate(clipText(`${prefix}${flag}zzzz`, 90)), false);
    } finally {
      intl.Segmenter = original;
    }
  });

  it("caps a stack of combining marks and a run of family emoji", () => {
    const max = 90;
    const stacked = clipText(`Z${"\u0302".repeat(990)}`, max);
    assert.ok(stacked.length <= max * 4);
    assert.equal(stacked.startsWith("Z"), true);
    assert.equal(stacked.includes("\uFFFD"), false);
    assert.equal(loneSurrogate(stacked), false);
    assert.ok([...stacked].length < 20);

    const family = "👨‍👩‍👧‍👦";
    const families = clipText(family.repeat(90), max);
    assert.ok(families.length <= max * 4);
    assert.equal(families.includes("\uFFFD"), false);
    assert.equal(loneSurrogate(families), false);
    assert.equal(families.split(family).join(""), "…");

    const kiss = "👩🏽‍❤️‍💋‍👨🏿";
    assert.ok([...kiss].length > 8);
    assert.equal(clipText(`${kiss} kiss`, 280), `${kiss} kiss`);
  });
});

describe("card og image url", () => {
  it("adds the card updated time and a zero version when that time is missing", () => {
    assert.equal(
      cardOgImagePath("abc", "2026-01-02T03:04:05.000Z"),
      "/cards/abc/opengraph-image?v=2026-01-02T03%3A04%3A05.000Z",
    );
    assert.equal(
      cardOgImagePath("abc", null, "maya"),
      "/u/maya/cards/abc/opengraph-image?v=0",
    );
  });

  it("sets og:image:type and twitter:image:alt", () => {
    const meta = withCardOgImage(
      previewMetadata({
        title: "Card",
        description: "A card on Slabhold.",
        imageUrl: null,
        detail: "",
      }),
      cardOgImagePath("abc", "2026-01-02T03:04:05.000Z"),
    );
    const og = meta.openGraph.images?.[0];
    assert.equal(typeof og, "object");
    assert.equal(og && typeof og === "object" && "type" in og ? og.type : "", "image/png");
    const twitter = meta.twitter.images?.[0];
    assert.equal(typeof twitter, "object");
    assert.equal(
      twitter && typeof twitter === "object" && "alt" in twitter ? twitter.alt : "",
      "Card on Slabhold",
    );
  });
});

describe("profile link previews", () => {
  it("shows the username and the public collection size", () => {
    const preview = profileLinkPreview({
      found: true,
      username: "donnietaz",
      displayName: "DonnieTaz",
      publicCardCount: 12,
    });
    assert.equal(preview.title, "DonnieTaz");
    assert.equal(preview.description, "@donnietaz · 12 cards");
    assert.equal(preview.detail, "12 cards");
  });

  it("omits a size when the public count was not loaded", () => {
    const preview = profileLinkPreview({
      found: true,
      username: "donnietaz",
      displayName: "DonnieTaz",
      publicCardCount: null,
    });
    assert.equal(preview.description.includes("card"), false);
    assert.equal(preview.detail, "");
  });

  it("does not invent a profile when the username is missing", () => {
    const preview = profileLinkPreview({ found: false, publicCardCount: 40 });
    assert.equal(preview.title, "Profile");
    assert.equal(preview.detail, "");
    assert.equal(JSON.stringify(preview).includes("40"), false);
  });
});

describe("post link previews", () => {
  it("uses the post text", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const preview = postLinkPreview({
      found: true,
      body: "Raw Wemby Prizm still feels like the hold.",
      imageUrl: STORAGE_IMAGE,
    });
    assert.equal(preview.title, "Raw Wemby Prizm still feels like the hold.");
    assert.equal(preview.description, preview.title);
    assert.equal(preview.imageUrl, STORAGE_IMAGE);
  });

  it("does not use a private card photo when the post has no image", () => {
    const image = postPreviewImage({
      postImageUrl: null,
      cardImageUrl: PHOTO,
      cardIsPublic: false,
    });
    assert.equal(image, null);
    const preview = postLinkPreview({
      found: true,
      body: "Looking at this one.",
      imageUrl: image,
    });
    assert.equal(preview.imageUrl, null);
    assert.equal(JSON.stringify(preview).includes(VALUE), false);
  });

  it("uses the public Mail Day card name and hides a private one", () => {
    const title = mailDayOgTitle({
      playerName: "J.J. McCarthy",
      year: 2024,
      setBrand: "Panini Donruss",
      parallel: "Optic Preview-Pink",
      cardNumber: "303",
    });
    const preview = postLinkPreview({
      found: true,
      body: "Private caption that must not be the title",
      mailDayTitle: title,
    });
    assert.equal(
      preview.title,
      "J.J. McCarthy 2024 Panini Donruss Optic Preview Pink #303 | Slabhold",
    );
    assert.equal(preview.description, preview.title);
    const meta = previewMetadata(preview);
    assert.equal(meta.title, preview.title);
    assert.equal(meta.openGraph.title, preview.title);
    assert.equal(meta.twitter.title, preview.title);

    const hidden = postLinkPreview({
      found: true,
      body: "Just the caption",
    });
    assert.equal(hidden.title, "Just the caption");
    const hiddenMeta = previewMetadata(hidden);
    assert.equal(hiddenMeta.title, "Just the caption · Slabhold");
    assert.equal(hiddenMeta.openGraph.title, hidden.title);
    assert.equal(hiddenMeta.twitter.title, hidden.title);
    assert.equal(JSON.stringify(hidden).includes("McCarthy"), false);
    for (const value of [
      preview.title,
      meta.title,
      meta.openGraph.title,
      meta.twitter.title,
      hidden.title,
      hiddenMeta.title,
      hiddenMeta.openGraph.title,
      hiddenMeta.twitter.title,
    ]) {
      assert.equal(typeof value, "string");
      assert.doesNotMatch(value, /Mail Day/i);
    }
  });

  it("can use a public card photo when the post has no image", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = postPreviewImage({
      postImageUrl: null,
      cardImageUrl: STORAGE_IMAGE,
      cardIsPublic: true,
    });
    assert.equal(image, STORAGE_IMAGE);
  });
});

describe("share image urls", () => {
  it("drops outside hosts, link-local addresses, and redirects, and keeps public storage", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    assert.equal(cleanImageUrl("https://evil.example/x.png"), null);
    assert.equal(cleanImageUrl("http://169.254.169.254/"), null);
    assert.equal(cleanImageUrl("http://169.254.169.254/latest/meta-data/"), null);
    assert.equal(cleanImageUrl(STORAGE_IMAGE), STORAGE_IMAGE);
    assert.equal(cleanImageUrl(TINY_PNG)?.startsWith("data:image/png;base64,"), true);

    const calls: Array<{ url: string; redirect: RequestRedirect | undefined }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        redirect: init?.redirect,
      });
      assert.ok(init?.signal);
      return new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/x.png" },
      });
    }) as typeof fetch;

    try {
      const avatar = profileLinkPreview({
        found: true,
        username: "donnietaz",
        avatarUrl: "https://evil.example/x.png",
      });
      const post = postLinkPreview({
        found: true,
        body: "Looking at this one.",
        imageUrl: "http://169.254.169.254/",
      });
      assert.equal(avatar.imageUrl, null);
      assert.equal(post.imageUrl, null);
      await renderProfileOg({ ...avatar, imageUrl: "https://evil.example/x.png" }, "COLLECTOR");
      assert.equal(await reachableImage(avatar.imageUrl), null);
      assert.equal(await reachableImage(post.imageUrl), null);
      assert.equal(await reachableImage("https://evil.example/x.png"), null);
      const remote = () => calls.filter((call) => !call.url.startsWith("data:"));
      assert.equal(remote().length, 0);

      assert.equal(await reachableImage(STORAGE_IMAGE), null);
      assert.equal(remote().length, 1);
      assert.equal(remote()[0]?.url, STORAGE_IMAGE);
      assert.equal(remote()[0]?.redirect, "manual");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("rejects a storage image larger than 5 MB without following a redirect", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(null, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(5 * 1024 * 1024 + 1),
        },
      })) as typeof fetch;
    try {
      assert.equal(await reachableImage(STORAGE_IMAGE), null);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("preview metadata", () => {
  it("puts the public title and description on Open Graph and Twitter", () => {
    const meta = previewMetadata(
      cardLinkPreview({
        isPublic: true,
        name: "Jordan Love",
        valueLabel: "$40",
      }),
    );
    assert.equal(meta.openGraph.title, "Jordan Love");
    assert.match(meta.openGraph.description, /\$40/);
    assert.equal(meta.twitter.card, "summary_large_image");
  });
});
