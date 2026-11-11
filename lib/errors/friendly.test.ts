import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONNECT_ERROR, GENERIC_ERROR, friendlyError, isNetworkFailure } from "@/lib/errors/friendly";

describe("friendlyError", () => {
  it("turns dropped connections into one plain sentence", () => {
    for (const raw of [
      "Failed to fetch",
      "TypeError: Load failed",
      "NetworkError when attempting to fetch resource.",
      "fetch failed",
      "The Internet connection appears to be offline.",
      "The request timed out.",
      "signal is aborted without reason",
    ]) {
      assert.equal(friendlyError(new Error(raw), "Could not log in."), CONNECT_ERROR, raw);
    }
    assert.ok(isNetworkFailure(new TypeError("Load failed")));
  });

  it("never shows the vendor or database internals", () => {
    for (const raw of [
      "Could not reach Supabase.",
      'new row violates row-level security policy for table "posts"',
      'duplicate key value violates unique constraint "likes_pkey"',
      "JWT expired",
      'relation "public.cards" does not exist',
      "PGRST116: JSON object requested, multiple (or no) rows returned",
      "Cannot read properties of undefined (reading 'id')",
      "Unexpected token < in JSON at position 0",
      "Loading chunk 123 failed.",
    ]) {
      const shown = friendlyError(new Error(raw), "Could not publish that post.");
      assert.equal(shown, "Could not publish that post.", raw);
      assert.doesNotMatch(shown, /supabase/i);
    }
  });

  it("rewords the common sign-in errors", () => {
    assert.equal(friendlyError("Invalid login credentials", "x"), "That email and password don't match.");
    assert.equal(friendlyError("User already registered", "x"), "That email already has an account. Try logging in.");
    assert.equal(
      friendlyError("For security purposes, you can only request this after 42 seconds.", "x"),
      "Too many tries. Wait a minute and try again.",
    );
  });

  it("keeps messages we wrote ourselves", () => {
    assert.equal(friendlyError("That post is unavailable.", "x"), "That post is unavailable.");
    assert.equal(friendlyError(new Error("You can't reply to this collector."), "x"), "You can't reply to this collector.");
  });

  it("falls back for empty, odd or very long messages", () => {
    assert.equal(friendlyError(null, "Could not save."), "Could not save.");
    assert.equal(friendlyError({}, "Could not save."), "Could not save.");
    assert.equal(friendlyError("a".repeat(400), "Could not save."), "Could not save.");
    assert.equal(friendlyError(new Error(""), undefined), GENERIC_ERROR);
  });
});
