import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { act, createElement, type ComponentType } from "react";
import { installDom } from "@/lib/test/dom";
import type { PollCounts, PostPoll } from "@/lib/social/polls";
import type { PostPollViewProps } from "./post-poll-view";
import type { ComposePollView as ComposePollType } from "./compose-poll-view";

const { win } = installDom();

let PostPollView: ComponentType<PostPollViewProps>;
let ComposePoll: typeof ComposePollType;

before(async () => {
  ({ PostPollView } = await import("./post-poll-view"));
  ({ ComposePollView: ComposePoll } = await import("./compose-poll-view"));
});

const NOW = Date.parse("2026-11-27T12:00:00Z");
const AUTHOR = "author";
const VIEWER = "viewer";

const poll: PostPoll = {
  id: "p1",
  endsAt: new Date(NOW + 2 * 86_400_000 + 60_000).toISOString(),
  options: [
    { id: "a", label: "Caleb" },
    { id: "b", label: "Jayden" },
    { id: "c", label: "Drake" },
  ],
};
const counts = (viewerChoice: string | null = null): PollCounts => ({
  total: 123,
  votes: { a: 70, b: 41, c: 12 },
  viewerChoice,
});

let cleanup: (() => void) | null = null;

async function render(element: ReturnType<typeof createElement>) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return {
    host,
    rerender: (next: ReturnType<typeof createElement>) => act(async () => root.render(next)),
  };
}

function view(over: Partial<PostPollViewProps> = {}) {
  const votes: string[] = [];
  let signIns = 0;
  const props: PostPollViewProps = {
    poll,
    authorId: AUTHOR,
    viewerId: VIEWER,
    counts: counts(),
    now: NOW,
    onVote: (id) => votes.push(id),
    onSignIn: () => (signIns += 1),
    ...over,
  };
  return { element: createElement(PostPollView, props), votes, signIns: () => signIns };
}

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

const state = (host: HTMLElement) => host.querySelector("[data-poll]")!.getAttribute("data-poll-state");
const footer = (host: HTMLElement) => host.querySelector("[data-poll-footer]")!.textContent;
const percents = (host: HTMLElement) =>
  [...host.querySelectorAll("[data-poll-percent]")].map((node) => Number(node.textContent!.replace("%", "")));

describe("a poll on a post", () => {
  it("shows the choices as buttons before you vote, and votes on a tap", async () => {
    const { element, votes } = view();
    const { host } = await render(element);
    assert.equal(state(host), "open");
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("[data-poll-choice]")];
    assert.deepEqual(buttons.map((button) => button.getAttribute("aria-label")), [
      "Vote for Caleb",
      "Vote for Jayden",
      "Vote for Drake",
    ]);
    act(() => buttons[1]!.click());
    assert.deepEqual(votes, ["b"]);
    assert.equal(footer(host), "123 votes · 2 days left");
  });

  it("shows results after you vote: a check on your choice, the leader semibold, 100% in all", async () => {
    const { element } = view({ counts: counts("b") });
    const { host } = await render(element);
    assert.equal(state(host), "results");
    assert.equal(host.querySelectorAll("[data-poll-choice]").length, 0, "no more buttons");
    const labels = [...host.querySelectorAll("[data-poll-label]")];
    assert.ok(labels[0]!.className.includes("font-semibold"), "the leader is semibold");
    assert.ok(!labels[1]!.className.includes("font-semibold"));
    assert.ok(labels[1]!.querySelector("[data-poll-check]"), "your choice is ticked");
    assert.equal(labels[0]!.querySelector("[data-poll-check]"), null);
    assert.deepEqual(percents(host), [57, 33, 10]);
    assert.equal(percents(host).reduce((sum, value) => sum + value, 0), 100);
    assert.match(host.textContent ?? "", /Jayden, 33%, your vote/);
  });

  it("shows the author results, never buttons", async () => {
    const { element } = view({ viewerId: AUTHOR });
    const { host } = await render(element);
    assert.equal(state(host), "results");
    assert.equal(host.querySelectorAll("button").length, 0);
  });

  it("says Final results once the poll ends", async () => {
    const { element } = view({ now: NOW + 3 * 86_400_000 });
    const { host } = await render(element);
    assert.equal(state(host), "final");
    assert.equal(footer(host), "123 votes · Final results");
  });

  it("shows signed-out visitors the results and asks them to sign in on a tap", async () => {
    const { element, votes, signIns } = view({ viewerId: null });
    const { host } = await render(element);
    assert.equal(state(host), "results");
    act(() => host.querySelector<HTMLButtonElement>("[data-poll-result] button")!.click());
    assert.equal(signIns(), 1);
    assert.deepEqual(votes, []);
    assert.match(host.textContent ?? "", /Sign in to vote/);
  });

  it("holds the buttons until it knows whether you voted, with no layout change", async () => {
    const { element } = view({ counts: null });
    const { host } = await render(element);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("[data-poll-choice]")];
    assert.equal(buttons.length, 3);
    assert.ok(buttons.every((button) => button.disabled));
    assert.ok(host.querySelector("[data-poll-footer] .skeleton-shimmer"), "the vote count is a skeleton, not 0");
  });
});

describe("the poll editor", () => {
  it("starts with 2 choices, adds up to 4, and caps each at 25 characters", async () => {
    let draft = { options: ["", ""], length: { days: 1, hours: 0, minutes: 0 } };
    let removed = 0;
    const editor = () =>
      createElement(ComposePoll, {
        draft,
        onChange: (next) => {
          draft = next;
        },
        onRemove: () => (removed += 1),
      });
    const { host, rerender } = await render(editor());
    const inputs = () => [...host.querySelectorAll<HTMLInputElement>("input")];
    assert.equal(inputs().length, 2);
    assert.ok(inputs().every((input) => input.maxLength === 25));
    const add = () => [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Add option"));
    act(() => add()!.click());
    await rerender(editor());
    act(() => add()!.click());
    await rerender(editor());
    assert.equal(inputs().length, 4);
    assert.equal(add(), undefined, "no Add option at 4");
    assert.equal(inputs()[2]!.getAttribute("aria-label"), "Choice 3 (optional)");
    const selects = [...host.querySelectorAll<HTMLSelectElement>("select")];
    assert.deepEqual(selects.map((select) => select.value), ["1", "0", "0"], "1 day by default");
    act(() => [...host.querySelectorAll("button")].find((button) => button.textContent === "Remove poll")!.click());
    assert.equal(removed, 1);
  });
});
