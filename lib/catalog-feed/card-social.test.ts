import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ACCOUNT_RESTRICTED,
  BLOCKED_CARD,
  canDeleteCardComment,
  CARD_COMMENT_MAX,
  cardSocialError,
  cleanCommentBody,
  COMMENT_EMPTY,
  COMMENT_REJECTED,
  COMMENT_TOO_LONG,
  commentCharsLeft,
} from "./card-social";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("card social errors", () => {
  it("23514 says the comment can't be posted; 42501 says the account is restricted", () => {
    assert.equal(cardSocialError({ code: "23514", message: "violates check constraint" }, "x"), COMMENT_REJECTED);
    assert.equal(COMMENT_REJECTED, "That comment can't be posted.");
    assert.equal(cardSocialError({ code: "42501", message: "account restricted" }, "x"), ACCOUNT_RESTRICTED);
  });

  it("an RLS refusal reads as a blocked card, and raw database text never shows", () => {
    assert.equal(
      cardSocialError({ code: "42501", message: 'new row violates row-level security policy for table "card_likes"' }, "x"),
      BLOCKED_CARD,
    );
    assert.equal(cardSocialError({ code: "XX000", message: "relation card_comments internal oops" }, "Couldn't post"), "Couldn't post");
    assert.equal(cardSocialError(null, "Fallback"), "Fallback");
  });
});

describe("comment rules", () => {
  it("takes 1 to 280 characters, trimmed, counting emoji as one", () => {
    assert.deepEqual(cleanCommentBody("   "), { ok: false, error: COMMENT_EMPTY });
    assert.deepEqual(cleanCommentBody("  clean slab  "), { ok: true, body: "clean slab" });
    assert.equal(cleanCommentBody("a".repeat(CARD_COMMENT_MAX)).ok, true);
    assert.deepEqual(cleanCommentBody("a".repeat(CARD_COMMENT_MAX + 1)), { ok: false, error: COMMENT_TOO_LONG });
    assert.equal(cleanCommentBody("🔥".repeat(CARD_COMMENT_MAX)).ok, true);
    assert.equal(cleanCommentBody(42).ok, false);
    assert.equal(commentCharsLeft("hi "), 278);
  });

  it("lets the writer or the card owner delete, nobody else", () => {
    const base = { commentUserId: "writer", cardOwnerId: "owner" };
    assert.equal(canDeleteCardComment({ ...base, viewerId: "writer" }), true);
    assert.equal(canDeleteCardComment({ ...base, viewerId: "owner" }), true);
    assert.equal(canDeleteCardComment({ ...base, viewerId: "someone" }), false);
    assert.equal(canDeleteCardComment({ ...base, viewerId: null }), false);
  });
});

describe("card server actions", () => {
  const actions = read("lib/catalog-feed/card-actions.ts");

  it("are server actions that write only card_likes and card_comments as the signed-in user", () => {
    assert.match(actions, /^"use server";/);
    assert.match(actions, /createSupabaseServer\(\)/);
    assert.doesNotMatch(actions, /createSupabaseAdmin|service_role/);
    assert.match(actions, /from\("card_likes"\)\.insert\(\{ card_id: input\.cardId, user_id: userId \}\)/);
    assert.match(actions, /from\("card_likes"\)\.delete\(\)\.eq\("card_id", input\.cardId\)\.eq\("user_id", userId\)/);
    assert.match(actions, /from\("card_comments"\)\s*\.insert\(/);
    assert.match(actions, /from\("card_comments"\)\.delete\(\)\.eq\("id", input\.commentId\)/);
  });

  it("check the rate limits before writing", () => {
    const like = actions.indexOf("consumeLikeLimit(userId)");
    const likeWrite = actions.indexOf('from("card_likes").insert');
    assert.ok(like > 0 && like < likeWrite, "hourly like limit first");
    const comment = actions.indexOf("consumeRateLimit(userId, CARD_COMMENTS_BUCKET");
    const commentWrite = actions.indexOf('from("card_comments")\n    .insert');
    assert.ok(comment > 0 && comment < commentWrite, "comment limit first");
  });

  it("add no SQL: nothing in supabase/migrations mentions the card tables", async () => {
    const { readdirSync } = await import("node:fs");
    for (const file of readdirSync(join(process.cwd(), "supabase/migrations"))) {
      assert.doesNotMatch(read(`supabase/migrations/${file}`), /card_likes|card_comments/, file);
    }
  });
});
