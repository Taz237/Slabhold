import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { avatarThumbSrc } from "@/lib/images/avatar-thumb";

const HOST = "https://knuwflptobyutrauxblj.supabase.co";
const AVATAR = `${HOST}/storage/v1/object/public/avatars/11111111-2222-4333-8444-555555555555/abc.jpg`;

describe("avatarThumbSrc", () => {
  it("asks Supabase for a small square of the project's own avatars", () => {
    assert.equal(
      avatarThumbSrc(AVATAR, 96),
      `${HOST}/storage/v1/render/image/public/avatars/11111111-2222-4333-8444-555555555555/abc.jpg?width=96&height=96&resize=cover`,
    );
  });

  it("uses the size it is given, as a whole number of pixels", () => {
    assert.match(avatarThumbSrc(AVATAR, 64), /\?width=64&height=64&resize=cover$/);
    assert.equal(avatarThumbSrc(AVATAR, 0), AVATAR);
    assert.equal(avatarThumbSrc(AVATAR, 95.5), AVATAR);
  });

  it("passes every other address through unchanged", () => {
    const others = [
      "https://cdn.example/avatar.png",
      // Another Supabase project.
      "https://otherproject.supabase.co/storage/v1/object/public/avatars/u/a.jpg",
      // Lookalike hosts.
      "https://knuwflptobyutrauxblj.supabase.co.evil.example/storage/v1/object/public/avatars/u/a.jpg",
      "http://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/avatars/u/a.jpg",
      "https://knuwflptobyutrauxblj.supabase.co:8443/storage/v1/object/public/avatars/u/a.jpg",
      // Other buckets, or not a public object.
      `${HOST}/storage/v1/object/public/card-photos/u/a.jpg`,
      `${HOST}/storage/v1/object/public/covers/u/a.jpg`,
      `${HOST}/storage/v1/object/sign/avatars/u/a.jpg?token=x`,
      `${HOST}/storage/v1/render/image/public/avatars/u/a.jpg?width=96&height=96&resize=cover`,
      // Already has a query or hash.
      `${AVATAR}?v=2`,
      `${AVATAR}#x`,
      // The bucket itself, no file.
      `${HOST}/storage/v1/object/public/avatars/`,
      // Not a URL.
      "avatars/u/a.jpg",
      "",
    ];
    for (const url of others) assert.equal(avatarThumbSrc(url, 96), url, url);
  });

  it("does not let a path step out of the avatars bucket", () => {
    const sneaky = `${HOST}/storage/v1/object/public/avatars/../card-photos/u/a.jpg`;
    assert.equal(avatarThumbSrc(sneaky, 96), sneaky);
    const encoded = `${HOST}/storage/v1/object/public/avatars/%2e%2e/card-photos/u/a.jpg`;
    assert.equal(avatarThumbSrc(encoded, 96), encoded);
  });
});
