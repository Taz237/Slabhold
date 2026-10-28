import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADD_FLOW_STEPS,
  answerCardNumber,
  answerGradeCompany,
  answerNotSureParallel,
  answerParallel,
  answerPlayer,
  answerSerial,
  answerSet,
  backStep,
  catalogJump,
  emptyFlowAnswers,
  flowProgress,
  initialFlowState,
  jumpToStep,
  nextStep,
  resumeStep,
  reviewParts,
  serialNoError,
  stepComplete,
  stepSkipped,
  type FlowAnswers,
} from "@/lib/cards/add-flow";
import { RAW_GRADING_COMPANY } from "@/lib/cards/grading-company";
import { NOT_SURE_PARALLEL } from "@/lib/value/match-confidence";
import type { CatalogCard } from "@/lib/card-catalog";

function answers(patch: Partial<FlowAnswers> = {}): FlowAnswers {
  return { ...emptyFlowAnswers(), ...patch };
}

const filled = answers({
  playerName: "Victor Wembanyama",
  sport: "Basketball",
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  cardNumber: "136",
  parallel: "Base",
  gradeCompany: RAW_GRADING_COMPANY,
});

describe("add flow steps", () => {
  it("runs Player, Year, Set, Card #, Parallel, Numbered?, Grade, Review", () => {
    assert.deepEqual(
      [...ADD_FLOW_STEPS],
      ["player", "year", "set", "number", "parallel", "serial", "grade", "review"],
    );
    let state = initialFlowState();
    const seen = [state.step];
    while (state.step !== "review") {
      state = nextStep(state, filled);
      seen.push(state.step);
    }
    assert.deepEqual(seen, [...ADD_FLOW_STEPS]);
  });

  it("goes back to the previous answered step", () => {
    let state = initialFlowState();
    state = nextStep(state, filled); // year
    state = nextStep(state, filled); // set
    state = nextStep(state, filled); // number
    assert.equal(state.step, "number");
    state = backStep(state);
    assert.equal(state.step, "set");
    state = backStep(state);
    assert.equal(state.step, "year");
    state = backStep(state);
    assert.equal(state.step, "player");
    assert.equal(backStep(state).step, "player", "nothing before Player");
  });

  it("skips Numbered? when the parallel has a known run, and back skips it too", () => {
    const red = { ...filled, parallel: "Red", serialRun: "299", knownRun: 299 };
    assert.equal(stepSkipped("serial", red), true);
    assert.equal(stepSkipped("serial", filled), false);
    const atParallel = { step: "parallel" as const, history: ["player", "year", "set", "number"] as const };
    let state = nextStep({ ...initialFlowState(), ...atParallel, history: [...atParallel.history] }, red);
    assert.equal(state.step, "grade");
    state = backStep(state);
    assert.equal(state.step, "parallel");
  });

  it("knows when Raw skips the grade numbers", () => {
    assert.equal(stepComplete("grade", { ...filled, gradeCompany: RAW_GRADING_COMPANY }), true);
    assert.equal(stepComplete("grade", { ...filled, gradeCompany: "PSA", gradeNumber: "" }), false);
    assert.equal(stepComplete("grade", { ...filled, gradeCompany: "PSA", gradeNumber: "10" }), true);
    const raw = answerGradeCompany(RAW_GRADING_COMPANY);
    assert.equal(raw.gradeCompany, RAW_GRADING_COMPANY);
    assert.equal(raw.advance, true, "Raw needs no number, so it moves on");
    const psa = answerGradeCompany("PSA");
    assert.equal(psa.advance, false, "PSA waits for a number");
    assert.equal(answerGradeCompany("not sure").gradeCompany, RAW_GRADING_COMPANY);
  });

  it("jumps from a Year 'Not sure' catalog pick to Parallel with year, set and number filled", () => {
    const pick: CatalogCard = {
      id: "cat-1",
      playerName: "Victor Wembanyama",
      yearLabel: "2023-24",
      setBrand: "Panini Prizm",
      cardNumber: "136",
      sport: "Basketball",
      parallel: "Base",
    };
    let state = nextStep(initialFlowState(), filled); // year
    const jumped = catalogJump(state, answers({ playerName: "Victor Wembanyama" }), pick);
    assert.equal(jumped.state.step, "parallel");
    assert.equal(jumped.answers.yearLabel, "2023-24");
    assert.equal(jumped.answers.setBrand, "Panini Prizm");
    assert.equal(jumped.answers.cardNumber, "136");
    assert.equal(jumped.answers.noNumber, false);
    state = backStep(jumped.state);
    assert.equal(state.step, "year");
  });

  it("returns to Review after an edit from Review", () => {
    let state = initialFlowState();
    while (state.step !== "review") state = nextStep(state, filled);
    state = jumpToStep(state, "set");
    assert.equal(state.step, "set");
    state = nextStep(state, filled);
    assert.equal(state.step, "review");
  });

  it("resumes a restored draft at the first unanswered step", () => {
    assert.equal(resumeStep(answers()), "player");
    assert.equal(resumeStep(answers({ playerName: "Zach Neto" })), "year");
    assert.equal(resumeStep(answers({ playerName: "Zach Neto", yearLabel: "2023" })), "set");
    assert.equal(resumeStep(filled), "review");
  });

  it("shows progress from the first step to Review", () => {
    assert.equal(flowProgress(initialFlowState(), filled), 0);
    let state = initialFlowState();
    while (state.step !== "review") state = nextStep(state, filled);
    assert.equal(flowProgress(state, filled), 1);
  });
});

describe("add flow answers", () => {
  it("picking a player sets the sport", () => {
    assert.deepEqual(answerPlayer("Zach Neto", "Baseball"), {
      form: { playerName: "Zach Neto", sport: "Baseball" },
    });
    assert.deepEqual(answerPlayer("  Someone New  ", ""), { form: { playerName: "Someone New" } });
  });

  it("a typed set stays custom, a listed one does not", () => {
    const typed = answerSet("My Custom Set", filled, false);
    assert.equal(typed.setIsCustom, true);
    const listed = answerSet("Topps Chrome", { ...filled, parallel: "Silver" }, false);
    assert.equal(listed.setIsCustom, false);
    assert.equal(listed.form.parallel, "Base", "Silver is not a Chrome parallel");
    assert.equal(listed.form.serialRun, "");
  });

  it("card number strips # and No number clears it", () => {
    assert.deepEqual(answerCardNumber("#SS-ZN", false), { form: { cardNumber: "SS-ZN" }, noNumber: false });
    assert.deepEqual(answerCardNumber("136", true), { form: { cardNumber: "" }, noNumber: true });
    assert.equal(stepComplete("number", { ...filled, cardNumber: "SS-ZN" }), true);
    assert.equal(stepComplete("number", { ...filled, cardNumber: "SS ZN!" }), false);
    assert.equal(stepComplete("number", { ...filled, cardNumber: "", noNumber: true }), true);
  });

  it("a known-run parallel pre-fills the run", () => {
    const red = answerParallel("Panini Prizm", "Red", 299, filled);
    assert.equal(red.form.parallel, "Red");
    assert.equal(red.form.serialRun, "299");
    assert.equal(red.parallelIsCustom, false);
    const unknown = answerParallel("Panini Prizm", "Blue Ice", null, { ...filled, serialRun: "299" });
    assert.equal(unknown.form.serialRun, "", "a new parallel clears an old run");
    assert.equal(unknown.parallelIsCustom, true, "not in the built-in Prizm list");
  });

  it("not sure saves Parallel (not sure) as custom with no run", () => {
    const patch = answerNotSureParallel();
    assert.equal(patch.form.parallel, NOT_SURE_PARALLEL);
    assert.equal(patch.parallelIsCustom, true);
    assert.equal(patch.form.serialRun, "");
  });
});

describe("Numbered? step", () => {
  it("chips write serial_run", () => {
    assert.deepEqual(answerSerial({ kind: "run", run: 99 }, filled).form, { serialRun: "99", serialNo: "" });
    assert.deepEqual(answerSerial({ kind: "run", run: 25 }, { ...filled, serialNo: "7" }).form, {
      serialRun: "25",
      serialNo: "7",
    });
    assert.deepEqual(answerSerial({ kind: "run", run: 5 }, { ...filled, serialNo: "7" }).form, {
      serialRun: "5",
      serialNo: "",
    });
  });

  it("1/1 writes 1/1", () => {
    assert.deepEqual(answerSerial({ kind: "one_of_one" }, filled).form, { serialRun: "1", serialNo: "1" });
  });

  it("Not numbered and Not sure write no run", () => {
    assert.deepEqual(answerSerial({ kind: "none" }, { ...filled, serialRun: "99" }).form, {
      serialRun: "",
      serialNo: "",
    });
    assert.deepEqual(answerSerial({ kind: "unsure" }, { ...filled, serialRun: "99" }).form, {
      serialRun: "",
      serialNo: "",
    });
  });

  it("rejects a serial number above the run with a clear message", () => {
    assert.equal(serialNoError("100", "99"), "Your number must be between 1 and 99.");
    assert.equal(serialNoError("0", "99"), "Your number must be between 1 and 99.");
    assert.equal(serialNoError("2.5", "99"), "Your number must be between 1 and 99.");
    assert.equal(serialNoError("23", "99"), null);
    assert.equal(serialNoError("", "99"), null, "optional");
    assert.equal(stepComplete("serial", { ...filled, serialRun: "99", serialNo: "100" }), false);
    assert.equal(stepComplete("serial", { ...filled, serialRun: "99", serialNo: "23" }), true);
  });
});

describe("review summary", () => {
  it("reads like the card, with each part pointing at its step", () => {
    const parts = reviewParts(
      {
        ...filled,
        yearLabel: "2024",
        cardNumber: "SS-ZN",
        parallel: "Red",
        serialRun: "99",
      },
      { isAuto: true },
    );
    assert.equal(
      parts.map((part) => part.text).join(""),
      "2024 Panini Prizm · #SS-ZN · Red /99 · Auto · Raw",
    );
    assert.deepEqual(
      parts.filter((part) => part.step).map((part) => part.step),
      ["year", "set", "number", "parallel", "serial", "parallel", "grade"],
    );
  });

  it("names a graded card and a card with no number", () => {
    const parts = reviewParts(
      { ...filled, noNumber: true, cardNumber: "", gradeCompany: "PSA", gradeNumber: "10" },
      { isAuto: false },
    );
    assert.equal(parts.map((part) => part.text).join(""), "2023-24 Panini Prizm · No number · Base · PSA 10");
  });
});

describe("flow position", () => {
  it("remembers the step for the same draft only", async () => {
    const { readFlowPosition, writeFlowPosition, clearFlowPosition } = await import("@/lib/cards/add-flow");
    const state = { step: "set" as const, history: ["player" as const, "year" as const], returnToReview: false };
    writeFlowPosition("user|seed", state);
    assert.deepEqual(readFlowPosition("user|seed"), state);
    assert.equal(readFlowPosition("other|seed"), null);
    clearFlowPosition();
    assert.equal(readFlowPosition("user|seed"), null);
  });

  it("applies a patch to the answers before the next render", async () => {
    const { answersWithPatch } = await import("@/lib/cards/add-flow");
    const next = answersWithPatch(filled, { form: { parallel: "Red", serialRun: "299" } }, 299);
    assert.equal(next.parallel, "Red");
    assert.equal(next.knownRun, 299);
    assert.equal(nextStep({ step: "parallel", history: [], returnToReview: false }, next).step, "grade");
  });
});

describe("opening step", () => {
  it("opens a Search pick on Parallel, with Back walking the earlier steps", async () => {
    const { flowStateAt, openingStep } = await import("@/lib/cards/add-flow");
    assert.equal(openingStep(filled), "parallel");
    assert.equal(openingStep(answers()), "player");
    assert.equal(openingStep(answers({ playerName: "Zach Neto", cardNumber: "12" })), "year");
    const state = flowStateAt("parallel", filled);
    assert.deepEqual(state.history, ["player", "year", "set", "number"]);
    assert.equal(backStep(state).step, "number");
  });
});
