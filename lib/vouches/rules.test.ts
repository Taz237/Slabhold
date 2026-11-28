import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  breakdownLine,
  cleanVouchText,
  DAILY_NEW_LIMIT,
  emptySummary,
  isVouchHint,
  LIST_MAX,
  MIN_ACCOUNT_DAYS,
  MIN_CHAT_HOURS,
  NOTE_MAX,
  NOTE_MIN_NON_POSITIVE,
  percentPositive,
  PERCENT_MIN_RATED,
  socialProofLine,
  SUMMARY_MAX_IDS,
  trustLine,
  VOUCH_COPY,
  VOUCH_HINTS,
  vouchButtonHidden,
  vouchCountLabel,
  vouchErrorCopy,
  vouchHintCopy,
  vouchNoteProblem,
  vouchReplyProblem,
  vouchTextLength,
} from "./rules";

const SQL = readFileSync(join(process.cwd(), "supabase/migrations/20261127200000_vouches.sql"), "utf8");

const summary = (positive: number, neutral: number, negative: number) => ({
  ...emptySummary("u1"),
  total: positive + neutral + negative,
  positive,
  neutral,
  negative,
});

/** Every string in a nested copy object, with functions called on a sample handle. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return strings((value as (handle: string) => unknown)("kev"));
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("vouch numbers mirror the database", () => {
  it("has the same numbers as private.vouch_rules()", () => {
    const sqlNumber = (name: string) => {
      const found = new RegExp(`^\\s*(\\d+)[,;]\\s+-- ${name}\\b`, "m").exec(SQL);
      assert.ok(found, `${name} is in the SQL`);
      return Number(found[1]);
    };
    assert.equal(MIN_ACCOUNT_DAYS, sqlNumber("MIN_ACCOUNT_DAYS"));
    assert.equal(MIN_CHAT_HOURS, sqlNumber("MIN_CHAT_HOURS"));
    assert.equal(NOTE_MAX, sqlNumber("NOTE_MAX"));
    assert.equal(NOTE_MIN_NON_POSITIVE, sqlNumber("NOTE_MIN_NON_POSITIVE"));
    assert.equal(DAILY_NEW_LIMIT, sqlNumber("DAILY_NEW_LIMIT"));
    assert.equal(SUMMARY_MAX_IDS, sqlNumber("SUMMARY_MAX_IDS"));
    assert.equal(LIST_MAX, sqlNumber("LIST_MAX"));
    assert.deepEqual([MIN_ACCOUNT_DAYS, MIN_CHAT_HOURS, NOTE_MAX, NOTE_MIN_NON_POSITIVE, DAILY_NEW_LIMIT, PERCENT_MIN_RATED], [7, 24, 280, 10, 10, 3]);
  });

  it("knows every hint the SQL raises, and nothing the SQL doesn't", () => {
    const raised = new Set([...SQL.matchAll(/'(vouch_[a-z_]+)'/g)].map((match) => match[1]!));
    // Kinds, tables and function names that look like hints but aren't.
    for (const other of ["vouch_reply", "vouch_id"]) raised.delete(other);
    assert.deepEqual([...raised].sort(), [...VOUCH_HINTS].sort());
  });
});

describe("trust line", () => {
  it("reads the way the profile shows it", () => {
    assert.equal(trustLine(summary(14, 0, 0)), "✓ 14 vouches · 100% positive");
    assert.equal(trustLine(summary(1, 0, 0)), "✓ 1 vouch");
    assert.equal(trustLine(summary(2, 0, 0)), "✓ 2 vouches");
    assert.equal(trustLine(summary(0, 0, 0)), "No vouches yet");
    assert.equal(trustLine(null), "No vouches yet");
    assert.equal(trustLine(undefined), "No vouches yet");
    assert.equal(trustLine(summary(1200, 0, 3)), "✓ 1,203 vouches · 99% positive");
  });

  it("shows the percent only once 3 vouches are positive or negative, and neutral never counts against anyone", () => {
    assert.equal(percentPositive(summary(2, 9, 0)), null);
    assert.equal(trustLine(summary(2, 9, 0)), "✓ 11 vouches");
    assert.equal(percentPositive(summary(3, 0, 0)), 100);
    assert.equal(percentPositive(summary(3, 40, 0)), 100);
    assert.equal(percentPositive(summary(3, 1, 1)), 75);
    assert.equal(percentPositive(summary(0, 0, 3)), 0);
    assert.equal(trustLine(summary(0, 5, 0)), "✓ 5 vouches");
  });

  it("rounds the percent down, so 99.6% never shows as 100%", () => {
    assert.equal(percentPositive(summary(249, 0, 1)), 99);
    assert.equal(percentPositive(summary(999, 0, 1)), 99);
    assert.equal(percentPositive(summary(2, 0, 1)), 66);
    assert.equal(trustLine(summary(249, 0, 1)), "✓ 250 vouches · 99% positive");
  });

  it("never shows a broken count", () => {
    assert.equal(trustLine({ total: Number.NaN, positive: 0, negative: 0 }), "No vouches yet");
    assert.equal(trustLine({ total: -4, positive: 0, negative: 0 }), "No vouches yet");
    assert.equal(vouchCountLabel(8), "8 vouches");
    assert.equal(vouchCountLabel(1), "1 vouch");
    assert.equal(vouchCountLabel(0), "0 vouches");
    assert.equal(breakdownLine(summary(12, 2, 0)), "12 positive · 2 neutral · 0 negative");
  });
});

describe("social proof", () => {
  it("names one handle and counts the rest", () => {
    const proof = (followedCount: number, followedSampleUsername: string | null) => socialProofLine({ followedCount, followedSampleUsername });
    assert.equal(proof(3, "kev"), "Vouched by @kev and 2 others you follow");
    assert.equal(proof(2, "@kev"), "Vouched by @kev and 1 other you follow");
    assert.equal(proof(1, "kev"), "Vouched by @kev, who you follow");
    assert.equal(proof(0, "kev"), "");
    assert.equal(proof(0, null), "");
    assert.equal(proof(4, null), "Vouched by 4 people you follow");
    assert.equal(proof(1, ""), "Vouched by 1 person you follow");
    assert.equal(socialProofLine(null), "");
  });
});

describe("notes and replies, checked the way the database checks them", () => {
  it("trims spaces, tabs and line breaks from the ends and turns CRLF into one line break", () => {
    assert.equal(cleanVouchText("  Shipped fast.\r\nCard as shown.\r\n  "), "Shipped fast.\nCard as shown.");
    assert.equal(cleanVouchText("\t\n hi \r\n"), "hi");
    assert.equal(cleanVouchText(null), "");
    // Only the four characters the SQL trims: a non-breaking space stays.
    assert.equal(cleanVouchText(" hi"), " hi");
  });

  it("counts a line break as one character however it was typed, and an emoji as one", () => {
    assert.equal(vouchTextLength("a\r\nb"), 3);
    assert.equal(vouchTextLength("a\nb"), 3);
    assert.equal(vouchTextLength("a\r\n\r\nb"), 4);
    assert.equal(vouchTextLength("  padded  "), 6);
    assert.equal(vouchTextLength("🔥"), 1);
    assert.equal(vouchTextLength(""), 0);
    // 280 characters with CRLF line breaks is still 280, not 284.
    const lines = `${"x".repeat(69)}\r\n`.repeat(4).slice(0, -2);
    assert.equal(vouchTextLength(lines), 279);
    assert.equal(vouchNoteProblem("positive", `${lines}y`), null);
  });

  it("needs a reason of 10 characters for neutral and negative, and none for positive", () => {
    assert.equal(vouchNoteProblem("positive", ""), null);
    assert.equal(vouchNoteProblem("neutral", ""), "vouch_note_required");
    assert.equal(vouchNoteProblem("negative", "too short"), "vouch_note_required");
    assert.equal(vouchNoteProblem("neutral", "   short    "), "vouch_note_required");
    assert.equal(vouchNoteProblem("negative", "ten chars!"), null);
  });

  it("caps at 280", () => {
    assert.equal(vouchNoteProblem("positive", "x".repeat(280)), null);
    assert.equal(vouchNoteProblem("positive", "x".repeat(281)), "vouch_note_too_long");
    assert.equal(vouchNoteProblem("positive", `  ${"x".repeat(280)}  `), null);
    assert.equal(vouchReplyProblem("x".repeat(281)), "vouch_note_too_long");
  });

  it("refuses control characters except a line break", () => {
    for (const bad of ["a\tb is a tab inside", "bell\u0007 character", "escape\u001b[31m code", "delete\u007f char", "lone\rreturn here", "nul\u0000 char"]) {
      assert.equal(vouchNoteProblem("positive", bad), "vouch_note_chars", JSON.stringify(bad));
      assert.equal(vouchReplyProblem(bad), "vouch_note_chars", JSON.stringify(bad));
    }
    assert.equal(vouchNoteProblem("positive", "Line one.\nLine two."), null);
    assert.equal(vouchNoteProblem("positive", "Line one.\r\nLine two."), null);
  });

  it("checks in the database's order: length, characters, then the word filter", () => {
    const blocked = (text: string) => /badword/i.test(text);
    assert.equal(vouchNoteProblem("positive", "A badword deal", blocked), "vouch_word_filter");
    assert.equal(vouchNoteProblem("positive", "A fine deal", blocked), null);
    assert.equal(vouchNoteProblem("positive", `badword\t${"x".repeat(300)}`, blocked), "vouch_note_too_long");
    assert.equal(vouchNoteProblem("neutral", "badword", blocked), "vouch_note_required");
    assert.equal(vouchNoteProblem("positive", "badword\there", blocked), "vouch_note_chars");
  });

  it("an empty reply removes the reply, so it is never a problem", () => {
    assert.equal(vouchReplyProblem(""), null);
    assert.equal(vouchReplyProblem("   \r\n "), null);
    assert.equal(vouchReplyProblem("Thanks, easy deal."), null);
  });
});

describe("refusal copy", () => {
  it("has friendly copy for every hint, the two extra ones and the new one included", () => {
    for (const hint of VOUCH_HINTS) {
      const copy = vouchHintCopy(hint, "kev");
      assert.ok(copy.length > 8, hint);
      assert.doesNotMatch(copy, /\{handle\}|vouch_|undefined/, hint);
      assert.equal(vouchErrorCopy({ hint }, "kev"), copy, hint);
    }
    for (const hint of ["vouch_rating", "vouch_too_many", "vouch_note_chars"]) assert.ok(isVouchHint(hint), hint);
  });

  it("says what the brief says", () => {
    // One line for both "not yet" message reasons: the real rule is 24 hours after you've both
    // messaged, so a reader who hasn't had a reply yet is told that, not half of it.
    assert.equal(vouchHintCopy("vouch_no_conversation"), "You can vouch 24 hours after you've both messaged.");
    assert.equal(vouchHintCopy("vouch_no_conversation"), vouchHintCopy("vouch_conversation_too_new"));
    for (const hint of VOUCH_HINTS) assert.doesNotMatch(vouchHintCopy(hint, "kev"), /once you've both sent each other a message/, hint);
    assert.equal(vouchHintCopy("vouch_conversation_too_new"), "You can vouch 24 hours after you've both messaged.");
    assert.equal(vouchHintCopy("vouch_too_new_voucher"), "Your account needs to be 7 days old to vouch.");
    assert.equal(vouchHintCopy("vouch_too_new_subject", "sam"), "@sam's account needs to be 7 days old to get vouches.");
    assert.equal(vouchHintCopy("vouch_too_new_subject", "@sam"), "@sam's account needs to be 7 days old to get vouches.");
    assert.equal(vouchHintCopy("vouch_too_new_subject"), "That account needs to be 7 days old to get vouches.");
    assert.equal(vouchHintCopy("vouch_rate_limited"), "You've left a lot of vouches today. Try again tomorrow.");
    assert.equal(vouchHintCopy("vouch_note_required"), "Add a short reason so others know what happened.");
    assert.equal(vouchHintCopy("vouch_note_chars"), "Remove the special characters and try again.");
  });

  it("never shows a raw database message", () => {
    const raw = { hint: null, message: 'new row for relation "vouches" violates check constraint "vouches_note"', code: "23514" };
    assert.equal(vouchErrorCopy(raw), VOUCH_COPY.failed);
    assert.equal(vouchErrorCopy({ hint: "something_else" }), VOUCH_COPY.failed);
    assert.equal(vouchErrorCopy(null), VOUCH_COPY.failed);
  });

  it("hides the Vouch button, instead of explaining, across a block", () => {
    assert.equal(vouchButtonHidden("vouch_blocked"), true);
    assert.equal(vouchButtonHidden("vouch_self"), true);
    assert.equal(vouchButtonHidden("vouch_no_conversation"), false);
    assert.equal(vouchButtonHidden("vouch_conversation_too_new"), false);
    assert.equal(vouchButtonHidden(null), false);
  });
});

describe("wording", () => {
  const all = [...strings(VOUCH_COPY), ...VOUCH_HINTS.flatMap((hint) => [vouchHintCopy(hint, "kev"), vouchHintCopy(hint)])];
  const lines = [
    ...all,
    trustLine(summary(14, 0, 0)),
    trustLine(summary(1, 0, 0)),
    trustLine(null),
    socialProofLine({ followedCount: 3, followedSampleUsername: "kev" }),
    socialProofLine({ followedCount: 1, followedSampleUsername: "kev" }),
    socialProofLine({ followedCount: 2, followedSampleUsername: null }),
    breakdownLine(summary(1, 2, 3)),
    vouchCountLabel(8),
  ];

  it("never uses the words we don't use, and never calls a person verified", () => {
    assert.ok(lines.length > 60);
    for (const line of lines) {
      assert.doesNotMatch(line, /\bbest\b|\bfree\b|number one|\bflip|\bmail|quick comp|verif/i, line);
      assert.doesNotMatch(line, /\bAI\b/, line);
    }
  });

  it("uses the exact strings from the brief", () => {
    assert.equal(VOUCH_COPY.sheetTitle("kev"), "Vouch for @kev");
    assert.equal(VOUCH_COPY.sheetSub, "How did your deal go?");
    assert.equal(VOUCH_COPY.notePlaceholder, "What happened? e.g. Shipped fast, card as shown.");
    assert.equal(VOUCH_COPY.sheetFootnote("kev"), "Everyone can see this on @kev's profile.");
    assert.equal(VOUCH_COPY.post, "Post vouch");
    assert.equal(VOUCH_COPY.save, "Save changes");
    assert.equal(
      VOUCH_COPY.pageFootnote,
      "Vouches show who's been solid in past deals. Slabhold doesn't handle money or check deals, so use a payment method with buyer protection.",
    );
    assert.deepEqual(
      [VOUCH_COPY.vouch, VOUCH_COPY.editVouch, VOUCH_COPY.removeVouch, VOUCH_COPY.reply, VOUCH_COPY.editReply],
      ["Vouch", "Edit vouch", "Remove vouch", "Reply", "Edit reply"],
    );
    assert.equal(VOUCH_COPY.pageMetaTitle("kev"), "Vouches for @kev");
    assert.equal(VOUCH_COPY.emptyOther("kev"), "Vouches come from people @kev has messaged with about a deal.");
    assert.equal(VOUCH_COPY.emptyOwn, "After a deal, the other collector can vouch for you from your chat.");
    assert.equal(VOUCH_COPY.emptyFilter.negative, "No negative vouches");
  });

  it("is sentence case: no shouting, no Title Case Buttons", () => {
    for (const line of all) {
      assert.doesNotMatch(line, /\b[A-Z]{4,}\b/, line);
      assert.doesNotMatch(line, /^[A-Z][a-z]+ [A-Z][a-z]+( [A-Z][a-z]+)*$/, line);
    }
  });
});
