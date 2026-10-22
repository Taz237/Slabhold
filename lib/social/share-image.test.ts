import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  PRIVATE_OG_CACHE_CONTROL,
  CARD_OG_CACHE_CONTROL,
  PUBLIC_OG_CACHE_CONTROL,
  renderOg,
  renderProfileOg,
  resetHomeShotCache,
} from "../../components/og-frame";
import { clipText, profileLinkPreview } from "./link-preview";
import {
  cardShareImage,
  homeShareImage,
  badgeShareImage,
  isGenericCardImage,
  mailDayPhotoUrls,
  postLayout,
  postOgCopy,
  postShareImage,
  profileShareImage,
  scrubPublicText,
  shareChip,
} from "./share-image";

const SUPABASE_ORIGIN = "https://project.supabase.co";
const STORAGE = `${SUPABASE_ORIGIN}/storage/v1/object/public/card-photos/user/card.jpg`;
const STORAGE_2 = `${SUPABASE_ORIGIN}/storage/v1/object/public/card-photos/user/two.jpg`;
const STORAGE_3 = `${SUPABASE_ORIGIN}/storage/v1/object/public/card-photos/user/three.jpg`;
const STORAGE_4 = `${SUPABASE_ORIGIN}/storage/v1/object/public/card-photos/user/four.jpg`;
const SECRET_ID = "11111111-1111-4111-8111-111111111111";

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;

describe("card share images", () => {
  it("shows the player, year and set, grade, value, and sales count", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = cardShareImage({
      found: true,
      isPublic: true,
      player: "Victor Wembanyama",
      yearLabel: "2023-24",
      setBrand: "Prizm",
      grade: "PSA 10",
      imageUrl: STORAGE,
      valueAmount: "$185.00",
      salesCount: 42,
    });
    assert.equal(image.player, "Victor Wembanyama");
    assert.equal(image.yearSet, "2023-24 Prizm");
    assert.equal(image.grade, "PSA 10");
    assert.equal(image.imageUrl, STORAGE);
    assert.equal(image.valueLabel, "$185.00");
    assert.equal(image.salesLabel, "Based on 42 sales");
    assert.equal(image.showValue, true);
    assert.equal(image.photoFallback, false);
  });

  it("drops the name, photo, and value when the card is private", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = cardShareImage({
      found: true,
      isPublic: false,
      player: "Victor Wembanyama",
      yearLabel: "2023-24",
      setBrand: "Prizm",
      grade: "PSA 10",
      imageUrl: STORAGE,
      valueAmount: "$9,999.00",
      salesCount: 42,
    });
    const packed = JSON.stringify(image);
    assert.equal(image.player, "Card");
    assert.equal(image.title, "Card");
    assert.equal(image.yearSet, "");
    assert.equal(image.grade, "");
    assert.equal(image.imageUrl, null);
    assert.equal(image.photoFallback, true);
    assert.equal(image.showValue, false);
    assert.equal(image.valueLabel, "");
    assert.equal(image.salesLabel, "");
    assert.equal(packed.includes("Wembanyama"), false);
    assert.equal(packed.includes("Prizm"), false);
    assert.equal(packed.includes("PSA"), false);
    assert.equal(packed.includes("card.jpg"), false);
    assert.equal(packed.includes("9,999"), false);
    assert.equal(packed.includes("42"), false);
  });

  it("drops the value when the price is private", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = cardShareImage({
      found: true,
      isPublic: true,
      pricePublic: false,
      player: "Victor Wembanyama",
      yearLabel: "2023",
      setBrand: "Prizm",
      grade: "PSA 10",
      imageUrl: STORAGE,
      valueAmount: "$9,999.00",
      salesCount: 42,
    });
    assert.equal(image.player, "Victor Wembanyama");
    assert.equal(image.imageUrl, STORAGE);
    assert.equal(image.showValue, false);
    assert.equal(JSON.stringify(image).includes("9,999"), false);
  });

  it("uses a branded fallback when there is no usable photo", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const missing = cardShareImage({
      found: true,
      isPublic: true,
      player: "Victor Wembanyama",
      imageUrl: null,
      valueAmount: "$10.00",
      salesCount: 1,
    });
    assert.equal(missing.imageUrl, null);
    assert.equal(missing.photoFallback, true);
    assert.equal(missing.player, "Victor Wembanyama");
    assert.equal(missing.salesLabel, "Based on 1 sale");

    const unsafe = cardShareImage({
      found: true,
      isPublic: false,
      player: "Victor Wembanyama",
      imageUrl: "https://evil.example/private.jpg",
      valueAmount: "$10.00",
    });
    assert.equal(unsafe.imageUrl, null);
    assert.equal(unsafe.photoFallback, true);
    assert.equal(JSON.stringify(unsafe).includes("Wembanyama"), false);
    assert.equal(JSON.stringify(unsafe).includes("evil.example"), false);
    assert.equal(JSON.stringify(unsafe).includes("$10.00"), false);
  });

  it("strips emails and ids from the card copy", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = cardShareImage({
      found: true,
      isPublic: true,
      player: `Victor ${SECRET_ID} secret@example.com`,
      yearLabel: "2023",
      setBrand: "Prizm",
      imageUrl: STORAGE,
      valueAmount: "$10.00",
      salesCount: 2,
    });
    const packed = JSON.stringify(image);
    assert.equal(packed.includes(SECRET_ID), false);
    assert.equal(packed.includes("secret@example.com"), false);
    assert.match(image.player, /Victor/);
  });

  it("does not invent a photo or a value for a missing card", () => {
    const image = cardShareImage({
      found: false,
      isPublic: true,
      player: "Hidden Name",
      imageUrl: STORAGE,
      valueAmount: "$10.00",
      salesCount: 4,
    });
    const packed = JSON.stringify(image);
    assert.equal(image.player, "Card");
    assert.equal(image.imageUrl, null);
    assert.equal(image.photoFallback, true);
    assert.equal(image.showValue, false);
    assert.equal(packed.includes("Hidden"), false);
    assert.equal(packed.includes("$10.00"), false);
  });

  it("does not treat a status sentence as a price", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = cardShareImage({
      found: true,
      isPublic: true,
      player: "Victor",
      imageUrl: STORAGE,
      valueAmount: "Not enough sales yet",
      salesCount: 0,
    });
    assert.equal(image.showValue, false);
    assert.equal(image.valueLabel, "");
    assert.equal(image.salesLabel, "");
  });

  it("draws a last sale or a range and does not add Based on under them", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const last = cardShareImage({
      found: true,
      isPublic: true,
      player: "Victor",
      imageUrl: STORAGE,
      valueAmount: "Last sold $12.00 on Oct 2",
      salesCount: 1,
    });
    assert.equal(last.valueLabel, "Last sold $12.00 on Oct 2");
    assert.equal(last.salesLabel, "");

    const range = cardShareImage({
      found: true,
      isPublic: true,
      player: "Victor",
      imageUrl: STORAGE,
      valueAmount: "$10.00\u2013$20.00 from 2 sales",
      salesCount: 2,
    });
    assert.equal(range.valueLabel, "$10.00\u2013$20.00 from 2 sales");
    assert.equal(range.salesLabel, "");

    const flat = cardShareImage({
      found: true,
      isPublic: true,
      player: "Victor",
      imageUrl: STORAGE,
      valueAmount: "~$12.00 from 2 sales",
      salesCount: 2,
    });
    assert.equal(flat.valueLabel, "~$12.00 from 2 sales");
    assert.equal(flat.salesLabel, "");

    const zero = cardShareImage({
      found: true,
      isPublic: true,
      player: "Victor",
      imageUrl: STORAGE,
      valueAmount: "$0.00",
      salesCount: 1,
    });
    assert.equal(zero.valueLabel, "");
    assert.equal(zero.showValue, false);
  });
});

describe("post and mail day share images", () => {
  it("puts the author above the text and a public card beside it", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = postShareImage({
      found: true,
      body: "Raw Wemby still feels like the hold.",
      authorName: "Donnie Taz",
      authorHandle: "@donnietaz",
      imageUrl: null,
      cards: [
        {
          isPublic: true,
          name: "2023-24 Prizm Victor Wembanyama PSA 10",
          valueLabel: "$185.00",
          imageUrl: STORAGE,
        },
      ],
    });
    assert.equal(image.authorName, "Donnie Taz");
    assert.equal(image.authorHandle, "donnietaz");
    assert.equal(image.body, "Raw Wemby still feels like the hold.");
    assert.equal(image.imageUrl, STORAGE);
    assert.equal(image.cardLines[0]?.name, "2023-24 Prizm Victor Wembanyama PSA 10");
    assert.equal(image.cardLines[0]?.value, "$185.00");
  });

  it("hides a private linked card's name, value, and photo", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = postShareImage({
      found: true,
      body: "Looking at this one.",
      authorName: "Donnie",
      authorHandle: "donnietaz",
      cards: [
        {
          isPublic: false,
          name: "Secret Player",
          valueLabel: "$9,999.00",
          imageUrl: STORAGE,
        },
      ],
    });
    const packed = JSON.stringify(image);
    assert.equal(image.imageUrl, null);
    assert.equal(image.cardLines.length, 0);
    assert.equal(packed.includes("Secret"), false);
    assert.equal(packed.includes("9,999"), false);
    assert.equal(packed.includes("card.jpg"), false);
  });

  it("shortens a combining stack and keeps the words after it", () => {
    const stacked = scrubPublicText(`Z${"\u0302".repeat(990)} after`, 280);
    assert.match(stacked, /^Z/);
    assert.match(stacked, /after/);
    assert.ok(stacked.length <= 280);

    const marked = scrubPublicText(`Hi é${"\u0301".repeat(300)} there`, 280);
    assert.match(marked, /there/);
    assert.match(marked, /^Hi /);
    assert.ok(marked.length <= 280);
  });

  it("keeps a kiss emoji whole", () => {
    const kiss = "👩🏽‍❤️‍💋‍👨🏿";
    const text = `${kiss} kiss`;
    assert.equal(scrubPublicText(text, 280), text);
    assert.equal(clipText(text, 280), text);
  });

  it("keeps a run of family emoji whole in the title", () => {
    const family = "👨‍👩‍👧‍👦";
    const image = postShareImage({
      found: true,
      body: `a${family.repeat(40)}`,
    });
    const title = image.title;
    assert.equal(title.includes("\uFFFD"), false);
    assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(title), false);
    assert.equal(title.split(family).join(""), "a");
    assert.equal(title.includes("\u200D"), true);
  });

  it("drops emails and ids from the post", () => {
    const image = postShareImage({
      found: true,
      body: `Hi secret@example.com see ${SECRET_ID}`,
      authorName: "secret@example.com",
      authorHandle: "secret@example.com",
    });
    const packed = JSON.stringify(image);
    assert.equal(image.authorName, "");
    assert.equal(image.authorHandle, "");
    assert.equal(packed.includes("secret@example.com"), false);
    assert.equal(packed.includes(SECRET_ID), false);
  });

  it("shows at most three mail day photos and no private value", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const photos = mailDayPhotoUrls(
      {
        paid: 77.77,
        email: "secret@example.com",
        cards: [
          { id: SECRET_ID, photos: [STORAGE, "https://evil.example/x.png"], paid: 12 },
          { photos: [STORAGE_2] },
          { photos: [STORAGE_3] },
          { photos: [STORAGE_4] },
        ],
      },
      STORAGE,
    );
    assert.deepEqual(photos, [STORAGE, STORAGE_2, STORAGE_3]);
    const image = postShareImage({
      found: true,
      postType: "mail_day",
      body: "Mail day",
      authorName: "Donnie",
      authorHandle: "donnietaz",
      mailDayPhotos: photos,
      cards: [
        { isPublic: true, name: "Wemby PSA 10", valueLabel: "$185.00", imageUrl: STORAGE },
        { isPublic: false, name: "Secret Player", valueLabel: "$9,999.00", imageUrl: STORAGE_4 },
      ],
    });
    const packed = JSON.stringify(image);
    assert.equal(image.kind, "mail");
    assert.equal(image.kicker, "POST");
    assert.doesNotMatch(image.kicker, /Mail Day/i);
    assert.deepEqual(image.photos, photos);
    assert.equal(image.cardLines.length, 1);
    assert.equal(image.cardLines[0]?.value, "$185.00");
    assert.equal(packed.includes("77.77"), false);
    assert.equal(packed.includes("Secret"), false);
    assert.equal(packed.includes("9,999"), false);
    assert.equal(packed.includes(SECRET_ID), false);
    assert.equal(packed.includes("evil.example"), false);
  });
});

describe("home share image", () => {
  it("keeps the headline and the subline", () => {
    const image = homeShareImage();
    assert.equal(image.kind, "home");
    assert.equal(image.title, "Sports cards, together.");
    assert.equal(image.detail, "Portfolio, flips, and a feed of collectors.");
  });
});

describe("share image renderer", () => {
  it("loads geist and renders a private card with no photo", async () => {
    for (const name of ["Geist-Regular.ttf", "Geist-Bold.ttf"]) {
      const font = readFileSync(join(process.cwd(), "assets/og", name));
      assert.ok(font.length > 10_000);
      assert.equal(font[0], 0);
      assert.equal(font[1], 1);
    }
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = cardShareImage({
      found: true,
      isPublic: false,
      player: "Victor Wembanyama",
      yearLabel: "2023-24",
      setBrand: "Prizm",
      grade: "PSA 10",
      imageUrl: null,
      valueAmount: "$9,999.00",
      salesCount: 42,
    });
    const response = await renderOg(image);
    assert.equal(response.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes[1], 0x50);
    assert.ok(bytes.length > 1000);
  });

  it("renders a post whose body is Arabic instead of crashing", async () => {
    const route = readFileSync(join(process.cwd(), "app/(app)/posts/[id]/opengraph-image.tsx"), "utf8");
    assert.match(route, /return renderOg\(/);
    const response = await renderOg(
      postShareImage({
        found: true,
        body: "Hello مرحبا بالعالم",
        authorName: "Donnie",
        authorHandle: "donnietaz",
      }),
    );
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("cache-control"), PUBLIC_OG_CACHE_CONTROL);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes[1], 0x50);
    assert.ok(bytes.length > 1000);
    const plain = await renderOg(
      postShareImage({
        found: true,
        body: "Hello",
        authorName: "Donnie",
        authorHandle: "donnietaz",
      }),
    );
    const home = await renderOg(homeShareImage());
    assert.deepEqual(bytes, Buffer.from(await plain.arrayBuffer()));
    assert.notDeepEqual(bytes, Buffer.from(await home.arrayBuffer()));
  });

  it("serves the home image when rendering fails for a reason other than font shaping", async () => {
    const home = Buffer.from(await (await renderOg(homeShareImage())).arrayBuffer());
    const model = postShareImage({
      found: true,
      body: "Hello",
      authorName: "Donnie",
      authorHandle: "donnietaz",
    });
    const original = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      const response = await renderOg({
        ...model,
        body: Object.create(null) as never,
      });
      assert.equal(
        response.headers.get("cache-control"),
        "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
      );
      assert.notEqual(response.headers.get("cache-control"), PUBLIC_OG_CACHE_CONTROL);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.deepEqual(bytes, home);
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.[0], "[og] share image render failed");
      assert.deepEqual(calls[0]?.[1], { kind: "post", stage: "render" });
      assert.equal(calls[0]?.[2] instanceof Error, true);
      const logged = JSON.stringify(calls[0]?.[1]);
      assert.equal(logged.includes("Hello"), false);
      assert.equal(logged.includes("body"), false);
      assert.equal(logged.includes("title"), false);
    } finally {
      console.error = original;
    }
  });

  it("falls back to the home image when the stripped retry also fails", async () => {
    const home = Buffer.from(await (await renderOg(homeShareImage())).arrayBuffer());
    const model = postShareImage({
      found: true,
      body: "Hello مرحبا",
      authorName: "Donnie",
      authorHandle: "donnietaz",
    });
    const original = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      const response = await renderOg({
        ...model,
        player: Object.create(null) as never,
      });
      assert.equal(response.headers.get("cache-control"), CARD_OG_CACHE_CONTROL);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.deepEqual(bytes, home);
      assert.equal(calls.length, 2);
      assert.equal(calls[0]?.[0], "[og] share image render failed");
      assert.equal(calls[1]?.[0], "[og] share image render failed");
      assert.deepEqual(calls[0]?.[1], { kind: "post", stage: "render" });
      assert.deepEqual(calls[1]?.[1], { kind: "post", stage: "strip" });
      assert.equal(calls[0]?.[2] instanceof Error, true);
      assert.match(
        (calls[0]?.[2] as Error).message,
        /lookupType: \d+ - substFormat: \d+ is not yet supported/,
      );
      for (const call of calls) {
        const logged = JSON.stringify(call[1]);
        assert.equal(logged.includes("Hello"), false);
        assert.equal(logged.includes("مرحبا"), false);
        assert.equal(logged.includes("body"), false);
        assert.equal(logged.includes("title"), false);
      }
    } finally {
      console.error = original;
    }
  });

  it("renders a profile whose display name is Arabic instead of the home image", async () => {
    const route = readFileSync(join(process.cwd(), "app/u/[username]/opengraph-image.tsx"), "utf8");
    assert.match(route, /return renderProfileOg\(/);
    assert.doesNotMatch(route, /PRIVATE_OG_CACHE_CONTROL/);
    const preview = {
      found: true,
      username: "donnietaz",
      displayName: "Hello مرحبا گیتی",
      publicCardCount: 4,
    } as const;
    const response = await renderProfileOg(profileLinkPreview(preview), "COLLECTOR");
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("cache-control"), PUBLIC_OG_CACHE_CONTROL);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.ok(bytes.length > 1000);
    const plain = await renderProfileOg(
      profileLinkPreview({ ...preview, displayName: "Hello" }),
      "COLLECTOR",
    );
    const home = await renderOg(homeShareImage());
    assert.deepEqual(bytes, Buffer.from(await plain.arrayBuffer()));
    assert.notDeepEqual(bytes, Buffer.from(await home.arrayBuffer()));
  });

  it("serves the home image when a profile fails for a reason other than font shaping", async () => {
    const home = Buffer.from(await (await renderOg(homeShareImage())).arrayBuffer());
    const preview = profileLinkPreview({
      found: true,
      username: "donnietaz",
      displayName: "Donnie",
      publicCardCount: 4,
    });
    const original = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      const response = await renderProfileOg(preview, Object.create(null) as never);
      assert.equal(response.headers.get("cache-control"), CARD_OG_CACHE_CONTROL);
      assert.equal(
        response.headers.get("cache-control"),
        "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.deepEqual(bytes, home);
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.[0], "[og] share image render failed");
      assert.deepEqual(calls[0]?.[1], { kind: "profile", stage: "render" });
      assert.equal(calls[0]?.[2] instanceof Error, true);
      const logged = JSON.stringify(calls[0]?.[1]);
      assert.equal(logged.includes("Donnie"), false);
      assert.equal(logged.includes("body"), false);
      assert.equal(logged.includes("title"), false);
    } finally {
      console.error = original;
    }
  });

  it("keeps the own-profile image private when it renders and when it falls back", async () => {
    const preview = profileLinkPreview({
      found: true,
      username: "donnietaz",
      displayName: "Donnie",
      publicCardCount: 4,
    });
    const rendered = await renderProfileOg(preview, "COLLECTOR", PRIVATE_OG_CACHE_CONTROL);
    assert.equal(rendered.headers.get("cache-control"), "private, no-store");
    assert.equal(rendered.headers.get("cache-control"), PRIVATE_OG_CACHE_CONTROL);
    const home = Buffer.from(await (await renderOg(homeShareImage())).arrayBuffer());
    const original = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      const fallback = await renderProfileOg(
        preview,
        Object.create(null) as never,
        PRIVATE_OG_CACHE_CONTROL,
      );
      assert.equal(fallback.headers.get("cache-control"), "private, no-store");
      assert.equal(fallback.headers.get("cache-control"), PRIVATE_OG_CACHE_CONTROL);
      assert.deepEqual(Buffer.from(await fallback.arrayBuffer()), home);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0]?.[1], { kind: "profile", stage: "render" });
    } finally {
      console.error = original;
    }
  });

  it("renders the home preview with the slab screenshot", async () => {
    const frame = readFileSync(join(process.cwd(), "components/og-frame.tsx"), "utf8");
    assert.match(
      frame,
      /join\(\/\* turbopackIgnore: true \*\/ process\.cwd\(\), "public", "landing", "2\.png"\)/,
    );
    assert.equal(frame.includes('join(process.cwd(), "public/landing/2.png")'), false);
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    assert.match(config, /node_modules\/sharp\/\*\*/);
    assert.match(config, /node_modules\/@img\/\*\*/);
    const response = await renderOg(homeShareImage());
    assert.equal(response.headers.get("cache-control"), PUBLIC_OG_CACHE_CONTROL);
    assert.match(PUBLIC_OG_CACHE_CONTROL, /s-maxage=3600/);
    assert.match(PUBLIC_OG_CACHE_CONTROL, /stale-while-revalidate=86400/);
    assert.match(CARD_OG_CACHE_CONTROL, /s-maxage=60/);
    assert.doesNotMatch(CARD_OG_CACHE_CONTROL, /s-maxage=3600/);
    // Cards, posts, profiles and badges: 60s, so an edit shows up quickly.
    for (const path of [
      "app/(app)/cards/[id]/opengraph-image.tsx",
      "app/(app)/u/[username]/cards/[id]/opengraph-image.tsx",
      "app/(app)/posts/[id]/opengraph-image.tsx",
      "app/(app)/u/[username]/opengraph-image.tsx",
      "app/(app)/u/[username]/badges/[category]/[tier]/opengraph-image.tsx",
      "app/api/share-image/badge/[username]/[category]/[tier]/route.tsx",
    ]) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      assert.match(source, /CARD_OG_CACHE_CONTROL/, path);
      assert.doesNotMatch(source, /PUBLIC_OG_CACHE_CONTROL/, path);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.ok(bytes.length > 5000);
    const ownProfile = readFileSync(
      join(process.cwd(), "app/(app)/profile/opengraph-image.tsx"),
      "utf8",
    );
    assert.match(ownProfile, /PRIVATE_OG_CACHE_CONTROL/);
    assert.equal(PRIVATE_OG_CACHE_CONTROL, "private, no-store");
    assert.doesNotMatch(PRIVATE_OG_CACHE_CONTROL, /s-maxage/);
  });
});

describe("private card select", () => {
  it("does not select price, notes, cert, email, or owner columns", () => {
    const source = readFileSync(join(process.cwd(), "lib/social/link-preview-load.ts"), "utf8");
    const start = source.indexOf("const PRIVATE_CARD_SELECT");
    const end = source.indexOf(";", start);
    const select = source.slice(start, end);
    assert.match(select, /player/);
    assert.match(select, /image_url/);
    assert.doesNotMatch(select, /paid_price/);
    assert.doesNotMatch(select, /estimated_value/);
    assert.doesNotMatch(select, /notes/);
    assert.doesNotMatch(select, /cert_number/);
    assert.doesNotMatch(select, /email/);
    assert.doesNotMatch(select, /user_id/);
  });
});

describe("home screenshot fallback", () => {
  const landingPng = readFileSync(join(process.cwd(), "public/landing/2.png"));

  function rememberEnv() {
    return {
      disk: process.env.SLABHOLD_HOME_SHOT_DISK,
      vercelUrl: process.env.VERCEL_URL,
      productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
      fetch: globalThis.fetch,
    };
  }

  function putEnv(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  function restoreEnv(saved: ReturnType<typeof rememberEnv>) {
    putEnv("SLABHOLD_HOME_SHOT_DISK", saved.disk);
    putEnv("VERCEL_URL", saved.vercelUrl);
    putEnv("VERCEL_PROJECT_PRODUCTION_URL", saved.productionUrl);
    putEnv("NEXT_PUBLIC_SITE_URL", saved.siteUrl);
    globalThis.fetch = saved.fetch;
    resetHomeShotCache();
  }

  function hideLocalShot() {
    process.env.SLABHOLD_HOME_SHOT_DISK = "off";
    resetHomeShotCache();
  }

  async function homePng(): Promise<Buffer> {
    const response = await renderOg(homeShareImage());
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes[1], 0x50);
    assert.equal(bytes[2], 0x4e);
    assert.equal(bytes[3], 0x47);
    assert.equal(bytes.readUInt32BE(16), 1200);
    assert.equal(bytes.readUInt32BE(20), 630);
    return bytes;
  }

  function stubFetch(
    respond: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
  ) {
    const calls: Array<{ url: string; redirect: RequestRedirect | undefined }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, redirect: init?.redirect });
      return respond(url, init);
    }) as typeof fetch;
    return calls;
  }

  function pngFetch() {
    return new Response(landingPng, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  }

  it("embeds a fetched png when the local file is missing", async () => {
    const saved = rememberEnv();
    try {
      hideLocalShot();
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
      delete process.env.NEXT_PUBLIC_SITE_URL;
      const hit = stubFetch(() => pngFetch());
      const embedded = await homePng();
      assert.equal(hit.length, 1);
      assert.equal(hit[0]?.redirect, "manual");
      assert.equal(hit[0]?.url, "https://slabhold.app/landing/2.png");

      hideLocalShot();
      stubFetch(
        () => new Response(null, { status: 302, headers: { location: "https://vercel.com/sso-api" } }),
      );
      const missed = await homePng();
      assert.ok(embedded.length > missed.length + 40_000);
    } finally {
      restoreEnv(saved);
    }
  });

  it("still renders a home image when the screenshot fetch misses", async () => {
    const saved = rememberEnv();
    try {
      hideLocalShot();
      const misses: Array<(url: string, init: RequestInit | undefined) => Response | Promise<Response>> = [
        () => new Response(null, { status: 302, headers: { location: "https://vercel.com/sso-api" } }),
        () =>
          new Response("<html>Log in to Vercel</html>", {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
        () => {
          throw new TypeError("network down");
        },
      ];
      for (const respond of misses) {
        hideLocalShot();
        const calls = stubFetch(respond);
        const bytes = await homePng();
        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.redirect, "manual");
        assert.ok(bytes.length > 1000);
      }

      hideLocalShot();
      const afterMiss = stubFetch(() => pngFetch());
      const recovered = await homePng();
      assert.equal(afterMiss.length, 1);
      assert.ok(recovered.length > 50_000);
    } finally {
      restoreEnv(saved);
    }
  });

  it("still renders a home image when the screenshot fetch times out", { timeout: 20_000 }, async () => {
    const saved = rememberEnv();
    try {
      hideLocalShot();
      const calls = stubFetch(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) {
              reject(new Error("missing timeout signal"));
              return;
            }
            // AbortSignal.timeout does not keep the event loop alive on its own.
            const keepAlive = setInterval(() => undefined, 500);
            const fail = () => {
              clearInterval(keepAlive);
              reject(signal.reason ?? new Error("The operation was aborted"));
            };
            if (signal.aborted) fail();
            else signal.addEventListener("abort", fail, { once: true });
          }),
      );
      const started = Date.now();
      const bytes = await homePng();
      assert.ok(Date.now() - started >= 4_500);
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.redirect, "manual");
      assert.ok(bytes.length > 1000);
    } finally {
      restoreEnv(saved);
    }
  });

  it("does not fetch the screenshot again after a success", async () => {
    const saved = rememberEnv();
    try {
      hideLocalShot();
      const calls = stubFetch(() => pngFetch());
      const first = await homePng();
      const second = await homePng();
      assert.equal(calls.length, 1);
      assert.ok(first.length > 50_000);
      assert.equal(second.length, first.length);
    } finally {
      restoreEnv(saved);
    }
  });

  it("loads the screenshot from the public production origin", async () => {
    const saved = rememberEnv();
    try {
      hideLocalShot();
      process.env.VERCEL_URL = "slabhold-git-preview-ripsandlots.vercel.app";
      process.env.VERCEL_PROJECT_PRODUCTION_URL = "slabhold.app";
      process.env.NEXT_PUBLIC_SITE_URL = "https://wrong.example";
      const production = stubFetch(
        () => new Response(null, { status: 302, headers: { location: "https://vercel.com/sso-api" } }),
      );
      await homePng();
      assert.equal(production[0]?.url, "https://slabhold.app/landing/2.png");
      assert.equal(production[0]?.redirect, "manual");
      assert.equal(production[0]?.url.includes("vercel.app"), false);

      hideLocalShot();
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
      delete process.env.NEXT_PUBLIC_SITE_URL;
      process.env.VERCEL_URL = "https://preview.vercel.app";
      const fallback = stubFetch(
        () => new Response(null, { status: 302, headers: { location: "https://vercel.com/sso-api" } }),
      );
      await homePng();
      assert.equal(fallback[0]?.url, "https://slabhold.app/landing/2.png");
    } finally {
      restoreEnv(saved);
    }
  });
});

describe("post previews", () => {
  const puka = {
    isPublic: true,
    name: "2023 Prizm Puka Nacua Silver PSA 10",
    valueLabel: "$120.00",
    player: "Puka Nacua",
    yearLabel: "2023",
    setBrand: "Prizm",
    parallel: "Silver",
    grade: "PSA 10",
    grader: "PSA",
    conditionType: "graded" as const,
  };

  it("uses the card photo as a slab hero, with the mono chip", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = postShareImage({
      found: true,
      body: "New Puka added",
      authorName: "Demo Collector",
      authorHandle: "democollector",
      cards: [{ ...puka, imageUrl: STORAGE }],
    });
    assert.equal(postLayout(image), "slab");
    assert.equal(image.slabs[0]?.src, STORAGE);
    assert.equal(image.slabs[0]?.company, "PSA");
    assert.equal(image.slabs[0]?.grade, "10");
    assert.equal(image.chip, "PUKA NACUA · 2023 PRIZM · SILVER", "no grade: the slab label shows it, and it was cut off");
  });

  it("falls back to the photo on the post's card snapshot when the card row has none", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = postShareImage({
      found: true,
      body: "New Puka added",
      authorName: "Demo Collector",
      authorHandle: "democollector",
      cards: [{ ...puka, imageUrl: null, snapshotImageUrl: STORAGE_2 }],
    });
    assert.equal(postLayout(image), "slab");
    assert.equal(image.slabs[0]?.src, STORAGE_2);
  });

  it("fans up to three public cards", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = postShareImage({
      found: true,
      body: "Pickups",
      authorName: "Demo Collector",
      authorHandle: "democollector",
      cards: [STORAGE, STORAGE_2, STORAGE_3, STORAGE_4].map((imageUrl) => ({ ...puka, imageUrl })),
    });
    assert.equal(postLayout(image), "fan-slabs");
    assert.equal(image.slabs.length, 3);
  });

  it("falls back to text only when the attached card is private", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = postShareImage({
      found: true,
      body: "New one",
      authorName: "Demo Collector",
      authorHandle: "democollector",
      cards: [{ ...puka, isPublic: false, player: "Secret Player", imageUrl: STORAGE, snapshotImageUrl: STORAGE_2 }],
    });
    const packed = JSON.stringify(image);
    assert.equal(postLayout(image), "text");
    assert.equal(image.chip, "");
    assert.equal(image.slabs.length, 0);
    assert.equal(packed.includes("Secret"), false);
    assert.equal(packed.includes("card.jpg"), false);
    assert.equal(packed.includes("two.jpg"), false);
  });

  it("prefers the post's own photo over a single card", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = postShareImage({
      found: true,
      body: "Shot of the PC",
      authorName: "Demo Collector",
      authorHandle: "democollector",
      imageUrl: STORAGE_3,
      cards: [{ ...puka, imageUrl: STORAGE }],
    });
    assert.equal(postLayout(image), "photo");
    assert.deepEqual(image.postPhotos, [STORAGE_3]);
    assert.equal(image.chip, "PUKA NACUA · 2023 PRIZM · SILVER", "no grade: the slab label shows it, and it was cut off");
  });

  it("leaves the grade off a graded card chip", () => {
    assert.equal(
      shareChip({ player: "Puka Nacua", year: 2023, setBrand: "Prizm", parallel: "Silver", grade: "PSA 10", grader: "PSA", conditionType: "graded" }),
      "PUKA NACUA · 2023 PRIZM · SILVER",
    );
  });

  it("leaves the grade off a raw card chip and drops Base", () => {
    assert.equal(
      shareChip({ player: "Puka Nacua", year: 2023, setBrand: "Prizm", parallel: "Base", grade: "", conditionType: "raw" }),
      "PUKA NACUA · 2023 PRIZM",
    );
  });

  it("captions the link with the author, not a copy of the image text", () => {
    assert.deepEqual(postOgCopy({ authorName: "DonnieTaz", authorHandle: "donnietaz", body: "New Puka added" }), {
      title: "DonnieTaz on Slabhold",
      description: "New Puka added",
    });
    assert.equal(postOgCopy({ authorName: "", authorHandle: "", body: "x" }), null);
  });
});

describe("profile and badge previews", () => {
  it("keeps up to three public card photos and three pins", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    const image = profileShareImage(
      { title: "Demo Collector", description: "", imageUrl: null, detail: "42 cards" },
      "COLLECTOR",
      {
        username: "democollector",
        badges: [
          { category: "collector", tier: "gold" },
          { category: "streak", tier: "silver" },
          { category: "slab-king", tier: "bronze" },
          { category: "following", tier: "bronze" },
        ],
        cards: [STORAGE, STORAGE_2, STORAGE_3, STORAGE_4, "https://evil.example/x.jpg"].map((imageUrl) => ({
          imageUrl,
          player: "Puka Nacua",
        })),
      },
    );
    assert.equal(image.badges.length, 3);
    assert.deepEqual(
      image.slabs.map((slab) => slab.src),
      [STORAGE, STORAGE_2, STORAGE_3],
    );
    assert.equal(image.authorHandle, "democollector");
  });

  it("builds the badge image copy", () => {
    const image = badgeShareImage({
      category: "collector",
      tier: "gold",
      name: "Gold Collector",
      tierLabel: "GOLD · COLLECTOR",
      username: "democollector",
      earnedLabel: "Earned Oct 20, 2026",
    });
    assert.equal(image.kind, "badge");
    assert.equal(image.kicker, "GOLD · COLLECTOR");
    assert.equal(image.authorHandle, "democollector");
    assert.deepEqual(image.badges, [{ category: "collector", tier: "gold" }]);
  });
});

describe("saved card image", () => {
  it("treats a private or missing card as generic, so no image is made", () => {
    assert.equal(isGenericCardImage(cardShareImage({ found: false })), true);
    assert.equal(
      isGenericCardImage(cardShareImage({ found: true, isPublic: false, player: "Secret", imageUrl: STORAGE })),
      true,
    );
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ORIGIN;
    assert.equal(
      isGenericCardImage(cardShareImage({ found: true, isPublic: true, player: "Puka Nacua", imageUrl: STORAGE })),
      false,
    );
  });
});
