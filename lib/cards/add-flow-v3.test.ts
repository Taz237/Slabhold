import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADD_FLOW_STEPS,
  answerCardNumber,
  answerParallel,
  answerPlayer,
  answerSet,
  answerYear,
  answersWithPatch,
  catalogJump,
  emptyFlowAnswers,
  flowCounter,
  flowStateAt,
  initialFlowState,
  jumpToStep,
  nextStep,
  openingStep,
  resumeStep,
  reviewMissing,
  reviewNumberedPart,
  reviewParts,
  setChoices,
  stepComplete,
  stepSkipped,
  yearSuggestion,
  type AddFlowStep,
  type FlowAnswers,
  type FlowPatch,
  type FlowState,
} from "@/lib/cards/add-flow";
import { RAW_GRADING_COMPANY } from "@/lib/cards/grading-company";
import type { CatalogCard } from "@/lib/card-catalog";

function answers(patch: Partial<FlowAnswers> = {}): FlowAnswers {
  return { ...emptyFlowAnswers(), ...patch };
}

const prizm: CatalogCard = {
  id: "cat-1",
  playerName: "Victor Wembanyama",
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  cardNumber: "136",
  sport: "Basketball",
  parallel: "Base",
};

describe("Numbered? only when it can be numbered", () => {
  it("skips it for Base and for a name that implies no run", () => {
    const base = answers({ parallel: "Base" });
    assert.equal(stepSkipped("serial", base), true);
    assert.equal(stepSkipped("serial", answers({ parallel: "Downtown" })), true);
    assert.equal(stepSkipped("serial", answers({ parallel: "Silver" })), true);
  });

  it("asks when the name implies a run or the checklist says the run varies", () => {
    assert.equal(stepSkipped("serial", answers({ parallel: "Gold /10" })), false);
    assert.equal(stepSkipped("serial", answers({ parallel: "Superfractor" })), false);
    assert.equal(stepSkipped("serial", answers({ parallel: "Gold", runVaries: true })), false);
  });

  it("still skips it when the checklist knows the run", () => {
    assert.equal(stepSkipped("serial", answers({ parallel: "Red", knownRun: 299 })), true);
  });

  it("never stops on Grade: it lives on Review", () => {
    assert.equal(stepSkipped("grade", answers()), true);
    assert.equal(stepSkipped("grade", answers({ gradeCompany: "PSA" })), true);
  });

  it("keeps every step id so restore, jump and Back still work", () => {
    assert.deepEqual(
      [...ADD_FLOW_STEPS],
      ["player", "year", "set", "number", "parallel", "serial", "grade", "review"],
    );
    const filled = answers({
      playerName: "Victor Wembanyama",
      yearLabel: "2023-24",
      setBrand: "Panini Prizm",
      cardNumber: "136",
    });
    let state = nextStep(flowStateAt("parallel", filled), filled);
    assert.equal(state.step, "review");
    state = jumpToStep(state, "serial");
    assert.equal(state.step, "serial");
    assert.equal(state.returnToReview, true);
    state = nextStep(state, { ...filled, serialRun: "99" });
    assert.equal(state.step, "review", "Numbered? from Review comes straight back");
  });
});

describe("Step N of M counts only the steps shown", () => {
  it("is 5 steps for a base raw card", () => {
    const filled = answers({ playerName: "A", yearLabel: "2024", setBrand: "Topps Chrome", cardNumber: "1" });
    assert.deepEqual(flowCounter(initialFlowState(), filled), { kind: "step", index: 1, total: 5 });
    assert.deepEqual(flowCounter(flowStateAt("parallel", filled), filled), { kind: "step", index: 5, total: 5 });
    assert.deepEqual(flowCounter(flowStateAt("review", filled), filled), { kind: "review" });
  });

  it("adds Numbered? when the parallel needs it", () => {
    const gold = answers({ parallel: "Gold /50" });
    assert.deepEqual(flowCounter(flowStateAt("serial", gold), gold), { kind: "step", index: 6, total: 6 });
  });
});

describe("Review finishes in place", () => {
  const filled = answers({
    playerName: "Victor Wembanyama",
    yearLabel: "2023-24",
    setBrand: "Panini Prizm",
    cardNumber: "136",
  });

  it("a grader with no grade is fixed on Review, not on an old step", () => {
    assert.equal(reviewMissing(filled), null);
    assert.equal(reviewMissing({ ...filled, gradeCompany: "PSA" }), "grade");
    assert.equal(stepComplete("review", { ...filled, gradeCompany: "PSA" }), false);
    assert.equal(reviewMissing({ ...filled, gradeCompany: "PSA", gradeNumber: "10" }), null);
    assert.equal(resumeStep({ ...filled, gradeCompany: "PSA" }), "review");
  });

  it("anything else missing names the step to jump to", () => {
    assert.equal(reviewMissing({ ...filled, cardNumber: "" }), "number");
    assert.equal(reviewMissing({ ...filled, serialRun: "50", serialNo: "77" }), "serial");
  });

  it("offers Numbered? after the summary when there is no run", () => {
    assert.deepEqual(reviewNumberedPart(filled), { text: "Numbered?", step: "serial", hint: true });
    assert.equal(reviewNumberedPart({ ...filled, parallel: "Purple", serialRun: "99" }), null);
    const parts = reviewParts(filled, { isAuto: false });
    assert.equal(parts.some((part) => part.text === "Numbered?"), false, "the summary itself reads like the card");
    assert.equal(parts.at(-1)?.text, "Raw");
    assert.equal(parts.at(-1)?.step, "grade");
  });
});

describe("pre-selected answers", () => {
  it("Year suggests the last-used year when it is a chip, else the newest", () => {
    const chips = ["2025-26", "2024-25", "2023-24"];
    assert.equal(yearSuggestion(chips, "2023-24"), "2023-24");
    assert.equal(yearSuggestion(chips, "1999"), "2025-26");
    assert.equal(yearSuggestion(chips, null), "2025-26");
    assert.equal(yearSuggestion([], "2024"), null);
  });

  it("Set leads with the last-used set, tagged", () => {
    const choices = setChoices({
      sport: "Basketball",
      catalogSets: ["Hoops"],
      productSets: [],
      lastUsed: "Donruss Optic",
    });
    assert.deepEqual(choices[0], { name: "Donruss Optic", maker: "Panini", source: "last" });
    assert.equal(choices.filter((choice) => choice.name === "Donruss Optic").length, 1);
    assert.equal(choices[1].name, "Hoops");
    const none = setChoices({ sport: "Basketball", catalogSets: [], productSets: [] });
    assert.equal(none.some((choice) => choice.source === "last"), false);
  });

  it("Parallel starts on Base", () => {
    assert.equal(emptyFlowAnswers().parallel, "Base");
  });
});

/**
 * Walks the pure flow like a person would. `tap` moves forward with one tap
 * (or one Return); `type` changes an answer without a tap. Returns the taps
 * and the questions shown before Review.
 */
function walk(start: { state: FlowState; answers: FlowAnswers }) {
  let state = start.state;
  let current = start.answers;
  let taps = 0;
  const shown: AddFlowStep[] = [state.step];
  const move = (next: FlowState) => {
    state = next;
    if (shown.at(-1) !== state.step) shown.push(state.step);
  };
  return {
    get state() {
      return state;
    },
    get answers() {
      return current;
    },
    taps: () => taps,
    shown: () => shown,
    /** A tap or Return that answers and moves on. */
    tap(patch?: FlowPatch, knownRun: number | null = current.knownRun) {
      taps += 1;
      if (patch) current = answersWithPatch(current, patch, knownRun);
      move(nextStep(state, current));
    },
    /** A tap that changes an answer on Review. */
    tapInPlace(patch: FlowPatch) {
      taps += 1;
      current = answersWithPatch(current, patch);
    },
    type(patch: FlowPatch) {
      current = answersWithPatch(current, patch);
    },
    jump(next: { state: FlowState; answers: FlowAnswers }) {
      taps += 1;
      current = next.answers;
      move(next.state);
    },
    add() {
      taps += 1;
      return stepComplete("review", current);
    },
  };
}

describe("tap counts", () => {
  it("raw card from search results: 3 taps (row, Base, Add)", () => {
    const flow = walk({ state: initialFlowState(), answers: answers() });
    flow.jump(catalogJump(flow.state, flow.answers, prizm));
    assert.equal(flow.state.step, "parallel");
    assert.equal(openingStep(flow.answers), "parallel");
    flow.tap(answerParallel("Panini Prizm", "Base", null, flow.answers), null);
    assert.equal(flow.state.step, "review");
    assert.equal(flow.add(), true);
    assert.equal(flow.taps(), 3);
    assert.deepEqual(flow.shown(), ["player", "parallel", "review"]);
  });

  it("raw card step by step: 6 taps (player, year, set, Return on Card #, Base, Add)", () => {
    const flow = walk({ state: initialFlowState(), answers: answers() });
    flow.tap(answerPlayer("Victor Wembanyama", "Basketball"));
    flow.tap(answerYear("2023-24"));
    flow.tap(answerSet("Panini Prizm", flow.answers, false));
    flow.type(answerCardNumber("136", false));
    flow.tap(); // Return on Card #
    flow.tap(answerParallel("Panini Prizm", "Base", null, flow.answers), null);
    assert.equal(flow.state.step, "review");
    assert.equal(flow.add(), true);
    assert.equal(flow.taps(), 6);
    assert.deepEqual(flow.shown(), ["player", "year", "set", "number", "parallel", "review"]);
  });

  it("PSA 10 slab from search: 5 taps (row, Base, PSA, 10, Add), cert adds at most 1", () => {
    const flow = walk({ state: initialFlowState(), answers: answers() });
    flow.jump(catalogJump(flow.state, flow.answers, prizm));
    flow.tap(answerParallel("Panini Prizm", "Base", null, flow.answers), null);
    assert.equal(flow.state.step, "review");
    flow.tapInPlace({ gradeCompany: "PSA" });
    assert.equal(reviewMissing(flow.answers), "grade", "Add would focus the grade chips");
    flow.tapInPlace({ gradeNumber: "10" });
    assert.equal(flow.add(), true);
    assert.equal(flow.taps(), 5);
    assert.deepEqual(flow.shown(), ["player", "parallel", "review"]);
  });

  it("starts every card Raw, so a raw card never taps a grade", () => {
    assert.equal(emptyFlowAnswers().gradeCompany, RAW_GRADING_COMPANY);
  });
});
