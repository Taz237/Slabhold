import assert from "node:assert/strict";
import { describe, it } from "node:test";
import nextConfig from "@/next.config";
import { AVATAR_ORIGIN, AVATAR_PATH, AVATAR_WIDTHS, avatarImage, avatarPx } from "@/lib/ui/avatar-src";
import { CARD_PHOTO_ORIGIN } from "@/lib/collection/grid";

const AVATAR = `${CARD_PHOTO_ORIGIN}${AVATAR_PATH}user-1/photo.jpg`;

describe("avatar images", () => {
  it("reads the drawn size from the height class", () => {
    assert.equal(avatarPx("h-10 w-10"), 40);
    assert.equal(avatarPx("-mt-14 h-24 w-24 text-xl ring-4"), 96);
    assert.equal(avatarPx("mt-0.5 h-6 w-6 text-[9px]"), 24);
    assert.equal(avatarPx("rounded-full"), 40);
  });

  it("asks the optimizer for a small copy at 1x and 2x", () => {
    assert.deepEqual(avatarImage(AVATAR, 40), {
      src: `/_next/image?url=${encodeURIComponent(AVATAR)}&w=96&q=75`,
      srcSet: undefined,
    });
    const big = avatarImage(AVATAR, 96);
    assert.equal(big.src, `/_next/image?url=${encodeURIComponent(AVATAR)}&w=96&q=75`);
    assert.match(big.srcSet ?? "", /w=96&q=75 1x, .*w=256&q=75 2x$/);
  });

  it("leaves local previews and other hosts alone", () => {
    assert.deepEqual(avatarImage("data:image/jpeg;base64,AAAA", 40), { src: "data:image/jpeg;base64,AAAA" });
    assert.deepEqual(avatarImage("https://cdn.example/a.png", 40), { src: "https://cdn.example/a.png" });
    assert.deepEqual(avatarImage(`${AVATAR}?v=2`, 40), { src: `${AVATAR}?v=2` });
  });

  it("only asks for widths and paths the optimizer allows", () => {
    assert.equal(AVATAR_ORIGIN, CARD_PHOTO_ORIGIN);
    const sizes = [...(nextConfig.images?.imageSizes ?? []), ...(nextConfig.images?.deviceSizes ?? [])];
    for (const width of AVATAR_WIDTHS) assert.ok(sizes.includes(width), String(width));
    const patterns = nextConfig.images?.remotePatterns ?? [];
    assert.ok(
      patterns.some(
        (pattern) =>
          typeof pattern === "object" &&
          "pathname" in pattern &&
          pattern.hostname === new URL(CARD_PHOTO_ORIGIN).hostname &&
          pattern.pathname === `${AVATAR_PATH}**`,
      ),
    );
  });
});
