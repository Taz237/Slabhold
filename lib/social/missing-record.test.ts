import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  hiddenOwnerNotFound,
  missingRecordAction,
  postLookupResult,
  profileLookupResult,
  publicCardLookupResult,
} from "./missing-record";

const CARD = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function callsBefore(path: string, call: string, view: string) {
  const page = read(path);
  const callAt = page.indexOf(call);
  const viewAt = page.indexOf(view);
  assert.ok(callAt > 0 && viewAt > callAt, `${path} should call ${call} before ${view}`);
}

describe("missing record 404", () => {
  it("404s a confirmed miss and leaves local mode and lookup errors alone", () => {
    assert.equal(missingRecordAction("missing"), "notFound");
    assert.equal(missingRecordAction("found"), "ok");
    assert.equal(missingRecordAction("error"), "ok");
    assert.equal(missingRecordAction("unconfigured"), "ok");

    assert.equal(
      postLookupResult({ configured: true, id: CARD, error: false, found: false }),
      "missing",
    );
    assert.equal(
      postLookupResult({ configured: true, id: "post-maya-1", error: false, found: false }),
      "missing",
    );
    assert.equal(
      postLookupResult({ configured: false, id: "post-maya-1", error: false, found: false }),
      "unconfigured",
    );
    assert.equal(
      postLookupResult({ configured: true, id: CARD, error: true, found: false }),
      "error",
    );

    assert.equal(
      profileLookupResult({ configured: true, username: "nobody", error: false, found: false }),
      "missing",
    );
    assert.equal(
      profileLookupResult({ configured: true, username: "  ", error: false, found: false }),
      "missing",
    );
    assert.equal(
      profileLookupResult({ configured: false, username: "maya", error: false, found: false }),
      "unconfigured",
    );

    assert.equal(
      publicCardLookupResult({
        configured: true,
        username: "maya",
        cardId: CARD,
        profileError: false,
        cardError: false,
        profileId: "owner",
        cardOwnerId: null,
      }),
      "missing",
    );
    assert.equal(
      publicCardLookupResult({
        configured: true,
        username: "maya",
        cardId: CARD,
        profileError: false,
        cardError: false,
        profileId: "owner",
        cardOwnerId: "someone-else",
      }),
      "missing",
    );
    assert.equal(
      publicCardLookupResult({
        configured: true,
        username: "maya",
        cardId: CARD,
        profileError: false,
        cardError: false,
        profileId: "owner",
        cardOwnerId: "owner",
      }),
      "found",
    );

    const owner = "11111111-1111-4111-8111-111111111111";
    const viewer = "22222222-2222-4222-8222-222222222222";
    assert.equal(
      hiddenOwnerNotFound({ viewerId: viewer, ownerId: owner, hiddenAuthorIds: [owner] }),
      true,
    );
    assert.equal(
      hiddenOwnerNotFound({ viewerId: null, ownerId: owner, hiddenAuthorIds: [owner] }),
      false,
    );
    assert.equal(
      hiddenOwnerNotFound({ viewerId: viewer, ownerId: owner, hiddenAuthorIds: [] }),
      false,
    );
    assert.equal(
      hiddenOwnerNotFound({ viewerId: viewer, ownerId: null, hiddenAuthorIds: [owner] }),
      false,
    );
  });

  it("dynamic card, post, and profile pages call notFound before rendering a miss", () => {
    callsBefore("app/posts/[id]/page.tsx", "await requirePost(id)", "<PostView");
    callsBefore("app/u/[username]/page.tsx", "await requireProfile(username)", "<ProfileView");
    callsBefore(
      "app/u/[username]/cards/[id]/page.tsx",
      "requirePublicCard(username, id)",
      "<PublicCardView",
    );
    callsBefore(
      "app/u/[username]/followers/page.tsx",
      "await requireProfile(name)",
      "<FollowList",
    );
    callsBefore(
      "app/u/[username]/following/page.tsx",
      "await requireProfile(name)",
      "<FollowList",
    );
    callsBefore(
      "app/cards/[id]/posts/page.tsx",
      "await requireCardPostsAccess(id)",
      "<CardPostsList",
    );
    callsBefore(
      "app/cards/[id]/edit/page.tsx",
      "await requireCardPageAccess(id)",
      "<EditCardPage",
    );
    const requireRecord = read("lib/social/require-record.ts");
    assert.match(requireRecord, /notFound\(\)/);
    assert.match(requireRecord, /missingRecordAction\(/);
    assert.match(requireRecord, /offersColumnMissing\(cardRes\.error\)/);
    assert.match(requireRecord, /select\(PUBLIC_CARD_SELECT\)/);
    assert.match(requireRecord, /Promise\.all\(\[/);
    assert.match(requireRecord, /loadHiddenAuthorIds\(supabase, false\)/);
    const hiddenAt = requireRecord.indexOf("hiddenOwnerNotFound(");
    const notFoundAt = requireRecord.indexOf("notFound()", hiddenAt);
    const returnAt = requireRecord.indexOf("return { profile, card }");
    assert.ok(hiddenAt > 0 && notFoundAt > hiddenAt && returnAt > notFoundAt);
    const cardPage = read("app/u/[username]/cards/[id]/page.tsx");
    const requireAt = cardPage.indexOf("await requirePublicCard(username, id)");
    const compsAt = cardPage.indexOf("getPublicCardComps(id)");
    const peopleAt = cardPage.indexOf("loadCardPeople(id)");
    assert.ok(requireAt > 0 && requireAt < compsAt && requireAt < peopleAt);
    assert.doesNotMatch(cardPage, /Promise\.all\(\[\s*requirePublicCard/);
  });
});
