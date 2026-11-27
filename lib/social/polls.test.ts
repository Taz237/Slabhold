import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pollEnded, pollFooter, pollFromMeta, pollLeaders, pollPercents, pollShowsResults, pollTimeLeft } from "./polls";
import { addChoice, clampPollLength, pollLengthChoices, removeChoice, repeatedChoices, setChoice } from "./poll-editor";
import {
  emptyPollDraft,
  pollDraftProblem,
  pollMinutes,
  POLL_CHOICE_COUNT,
  POLL_CHOICE_REPEAT,
  POLL_CHOICE_REQUIRED,
  POLL_CHOICE_TOO_LONG,
  POLL_LENGTH_ERROR,
  type PollDraft,
} from "./poll-draft";
import { pollCountsFromRows, pollErrorMessage } from "./poll-remote";

const NOW = Date.parse("2026-11-27T12:00:00Z");
const draft = (options: string[], length = { days: 1, hours: 0, minutes: 0 }): PollDraft => ({ options, length });

describe("poll drafts", () => {
  it("start with 2 empty choices and a 1 day length", () => {
    const empty = emptyPollDraft();
    assert.deepEqual(empty.options, ["", ""]);
    assert.equal(pollMinutes(empty.length), 24 * 60);
    assert.equal(pollDraftProblem(empty), POLL_CHOICE_REQUIRED);
  });

  it("take 2 to 4 choices, never more", () => {
    let poll = emptyPollDraft();
    poll = addChoice(poll);
    poll = addChoice(poll);
    assert.equal(poll.options.length, 4);
    assert.equal(addChoice(poll).options.length, 4, "a fifth is not added");
    assert.equal(pollDraftProblem(draft(["Yes"])), POLL_CHOICE_COUNT);
    assert.equal(pollDraftProblem(draft(["a", "b", "c", "d", "e"])), POLL_CHOICE_COUNT);
    assert.equal(pollDraftProblem(draft(["a", "b"])), null);
    assert.equal(pollDraftProblem(draft(["a", "b", "c", "d"])), null);
  });

  it("only drop the optional choices", () => {
    const four = draft(["a", "b", "c", "d"]);
    assert.deepEqual(removeChoice(four, 2).options, ["a", "b", "d"]);
    assert.deepEqual(removeChoice(four, 0).options, four.options, "choices 1 and 2 stay");
    assert.deepEqual(removeChoice(draft(["a", "b"]), 1).options, ["a", "b"]);
  });

  it("hold each choice to 25 characters and require every one", () => {
    const long = "x".repeat(30);
    assert.equal(setChoice(emptyPollDraft(), 0, long).options[0], "x".repeat(25), "typing stops at 25");
    assert.equal(pollDraftProblem(draft(["a", "x".repeat(25)])), null);
    assert.equal(pollDraftProblem(draft(["a", "x".repeat(26)])), POLL_CHOICE_TOO_LONG);
    assert.equal(pollDraftProblem(draft(["a", "   "])), POLL_CHOICE_REQUIRED);
    assert.equal(pollDraftProblem(draft(["a", "b", ""])), POLL_CHOICE_REQUIRED, "an added choice must be filled");
  });

  it("refuse repeated choices, whatever the case or spaces", () => {
    assert.equal(pollDraftProblem(draft(["Yes", " yes "])), POLL_CHOICE_REPEAT);
    assert.deepEqual([...repeatedChoices(["Yes", "No", "YES", ""])], [2]);
  });

  it("run from 5 minutes to 7 days", () => {
    assert.equal(pollDraftProblem(draft(["a", "b"], { days: 0, hours: 0, minutes: 5 })), null);
    assert.equal(pollDraftProblem(draft(["a", "b"], { days: 0, hours: 0, minutes: 4 })), POLL_LENGTH_ERROR);
    assert.equal(pollDraftProblem(draft(["a", "b"], { days: 7, hours: 0, minutes: 0 })), null);
    assert.equal(pollDraftProblem(draft(["a", "b"], { days: 7, hours: 1, minutes: 0 })), POLL_LENGTH_ERROR);
  });

  it("keep the length picker in range the way X does", () => {
    assert.deepEqual(clampPollLength({ days: 0, hours: 0, minutes: 0 }), { days: 0, hours: 0, minutes: 5 });
    assert.deepEqual(clampPollLength({ days: 7, hours: 5, minutes: 30 }), { days: 7, hours: 0, minutes: 0 });
    assert.deepEqual(clampPollLength({ days: 9, hours: 30, minutes: 90 }), { days: 7, hours: 0, minutes: 0 });
    assert.deepEqual(clampPollLength({ days: 2, hours: 3, minutes: 4 }), { days: 2, hours: 3, minutes: 4 });
    assert.deepEqual(pollLengthChoices("hours", { days: 7, hours: 0, minutes: 0 }), [0]);
    assert.equal(pollLengthChoices("minutes", { days: 0, hours: 0, minutes: 5 })[0], 5);
    assert.equal(pollLengthChoices("minutes", { days: 1, hours: 0, minutes: 0 })[0], 0);
    assert.equal(pollLengthChoices("days", { days: 1, hours: 0, minutes: 0 }).length, 8);
  });
});

describe("poll percentages", () => {
  it("always add up to 100", () => {
    const cases = [
      [1, 1, 1],
      [2, 1],
      [1, 1, 1, 1],
      [7, 3, 0, 1],
      [333, 333, 334],
      [1, 2, 3, 4],
      [99, 1],
      [5, 0],
    ];
    for (const votes of cases) {
      const percents = pollPercents(votes);
      assert.equal(percents.reduce((sum, value) => sum + value, 0), 100, `sum for ${votes.join(",")}`);
      assert.ok(percents.every((value) => Number.isInteger(value) && value >= 0));
    }
    assert.deepEqual(pollPercents([1, 1, 1]), [34, 33, 33]);
    assert.deepEqual(pollPercents([2, 1]), [67, 33]);
    assert.deepEqual(pollPercents([5, 0]), [100, 0]);
  });

  it("are all 0 before anyone votes", () => {
    assert.deepEqual(pollPercents([0, 0, 0]), [0, 0, 0]);
  });

  it("add up to 100 for any count", () => {
    for (let seed = 1; seed < 500; seed += 1) {
      const votes = [seed % 7, (seed * 3) % 11, (seed * 5) % 13, seed % 2].slice(0, 2 + (seed % 3));
      if (votes.every((value) => value === 0)) continue;
      assert.equal(pollPercents(votes).reduce((sum, value) => sum + value, 0), 100);
    }
  });
});

describe("showing a poll", () => {
  const poll = {
    id: "p",
    endsAt: new Date(NOW + 2 * 86_400_000 + 5_000).toISOString(),
    options: [
      { id: "a", label: "Caleb" },
      { id: "b", label: "Jayden" },
    ],
  };

  it("shows buttons until you vote, then results", () => {
    const base = { signedIn: true, isAuthor: false, viewerChoice: null, ended: false };
    assert.equal(pollShowsResults(base), false);
    assert.equal(pollShowsResults({ ...base, viewerChoice: "a" }), true, "after voting");
    assert.equal(pollShowsResults({ ...base, isAuthor: true }), true, "the author");
    assert.equal(pollShowsResults({ ...base, ended: true }), true, "once it ends");
    assert.equal(pollShowsResults({ ...base, signedIn: false }), true, "signed out");
  });

  it("says how long is left, then Final results", () => {
    assert.equal(pollFooter(123, poll.endsAt, NOW), "123 votes · 2 days left");
    assert.equal(pollFooter(1, poll.endsAt, NOW), "1 vote · 2 days left");
    assert.equal(pollFooter(1234, poll.endsAt, NOW), "1,234 votes · 2 days left");
    assert.equal(pollTimeLeft(new Date(NOW + 3_600_000).toISOString(), NOW), "1 hour left");
    assert.equal(pollTimeLeft(new Date(NOW + 5 * 3_600_000 + 1).toISOString(), NOW), "5 hours left");
    assert.equal(pollTimeLeft(new Date(NOW + 12 * 60_000).toISOString(), NOW), "12 minutes left");
    assert.equal(pollTimeLeft(new Date(NOW + 10_000).toISOString(), NOW), "1 minute left");
    assert.equal(pollFooter(0, new Date(NOW - 1).toISOString(), NOW), "0 votes · Final results");
    assert.equal(pollEnded({ endsAt: new Date(NOW).toISOString() }, NOW), true);
  });

  it("leads with the most votes, ties included, and nobody before votes", () => {
    assert.deepEqual([...pollLeaders(poll, { votes: { a: 3, b: 1 } })], ["a"]);
    assert.deepEqual([...pollLeaders(poll, { votes: { a: 2, b: 2 } })], ["a", "b"]);
    assert.deepEqual([...pollLeaders(poll, { votes: {} })], []);
  });
});

describe("stored polls", () => {
  const meta = {
    images: ["x"],
    poll: {
      id: "11111111-1111-4111-8111-111111111111",
      ends_at: "2026-11-28T12:00:00+00:00",
      options: [
        { id: "o1", label: "Caleb" },
        { id: "o2", label: "Jayden" },
      ],
    },
  };

  it("reads the poll copy on posts.meta", () => {
    assert.deepEqual(pollFromMeta(meta), {
      id: meta.poll.id,
      endsAt: meta.poll.ends_at,
      options: meta.poll.options,
    });
    assert.equal(pollFromMeta(null), null);
    assert.equal(pollFromMeta({ poll: { ...meta.poll, options: [meta.poll.options[0]] } }), null, "one choice");
    assert.equal(pollFromMeta({ poll: { ...meta.poll, ends_at: "soon" } }), null, "a bad time");
    assert.equal(pollFromMeta({ poll: { ...meta.poll, options: [{ id: "o1" }, { id: "o2", label: "x" }] } }), null);
  });

  it("reads counts and the viewer's choice from poll_results rows", () => {
    const counts = pollCountsFromRows([
      {
        poll_id: "p1",
        ends_at: "x",
        total_votes: 3,
        options: [
          { id: "o1", votes: 2 },
          { id: "o2", votes: 1 },
        ],
        viewer_option_id: "o2",
      },
      { poll_id: "p2", total_votes: 0, options: [], viewer_option_id: null },
      "junk",
    ]);
    assert.deepEqual(counts.get("p1"), { total: 3, votes: { o1: 2, o2: 1 }, viewerChoice: "o2" });
    assert.deepEqual(counts.get("p2"), { total: 0, votes: {}, viewerChoice: null });
    assert.equal(counts.size, 2);
  });

  it("turns the database's reasons into plain words", () => {
    assert.equal(pollErrorMessage({ hint: "own_poll" }), "You can't vote in your own poll.");
    assert.equal(pollErrorMessage({ hint: "poll_ended" }), "This poll has ended.");
    assert.equal(pollErrorMessage({ hint: "already_voted" }), "You already voted in this poll.");
    assert.equal(pollErrorMessage({ hint: "poll_choice_length" }), POLL_CHOICE_TOO_LONG);
    assert.equal(pollErrorMessage(null), "Couldn't save your vote. Try again.");
  });
});
