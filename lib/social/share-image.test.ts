import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { renderOg } from "../../components/og-frame";
import {
  cardShareImage,
  homeShareImage,
  mailDayPhotoUrls,
  postShareImage,
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

  it("keeps the photo and name when the card is private, and drops the value", () => {
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
    assert.equal(image.player, "Victor Wembanyama");
    assert.equal(image.yearSet, "2023-24 Prizm");
    assert.equal(image.grade, "PSA 10");
    assert.equal(image.imageUrl, STORAGE);
    assert.equal(image.showValue, false);
    assert.equal(image.valueLabel, "");
    assert.equal(image.salesLabel, "");
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
    const response = renderOg(image);
    assert.equal(response.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes[1], 0x50);
    assert.ok(bytes.length > 1000);
  });

  it("renders the home preview with the slab screenshot", async () => {
    const response = renderOg(homeShareImage());
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.ok(bytes.length > 5000);
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
