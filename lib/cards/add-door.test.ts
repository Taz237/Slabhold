import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DOOR_CATALOG_MIN_CHARS,
  DOOR_PLACEHOLDER,
  clearDoorQuery,
  doorEnterPick,
  doorInserts,
  doorSets,
  doorTypedName,
  doorWantsCatalog,
  parseDoorQuery,
  readDoorQuery,
  writeDoorQuery,
} from "@/lib/cards/add-door";
import {
  ADD_FLOW_STEPS,
  ADD_FLOW_SUBLINE,
  STEP_BY_STEP_QUESTION,
  STEP_QUESTIONS,
  answerParallel,
  answerPlayer,
  answersWithPatch,
  backStep,
  catalogJump,
  emptyFlowAnswers,
  initialFlowState,
  nextStep,
  openingStep,
  setChoices,
} from "@/lib/cards/add-flow";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import type { CatalogCard } from "@/lib/card-catalog";

describe("search door: what's on the card", () => {
  it("asks one question with the brief's placeholder and keeps the step list", () => {
    assert.equal(STEP_QUESTIONS.player, "What's on the card?");
    assert.equal(STEP_BY_STEP_QUESTION, "Who's on the card?");
    assert.equal(DOOR_PLACEHOLDER, "Try Malik Nabers Kaboom or Tyrese Maxey Downtown");
    assert.equal(initialFlowState().step, "player", "the door is the first screen");
    assert.deepEqual([...ADD_FLOW_STEPS].slice(0, 2), ["player", "year"]);
  });

  it("does not promise a scan in the subline", () => {
    assert.equal(ADD_FLOW_SUBLINE, "Add a photo if you have one, then find the card.");
    assert.doesNotMatch(ADD_FLOW_SUBLINE, /scan|snap/i);
  });

  it("parses 'Maxey Downtown' into player + insert", () => {
    for (const query of ["Maxey Downtown", "Tyrese Maxey Downtown", "tyrese maxey downtown"]) {
      const parsed = parseDoorQuery(query, INDEXED_DIRECTORY);
      assert.equal(parsed.insert, "Downtown", query);
      assert.equal(parsed.combo?.player.name, "Tyrese Maxey", query);
      assert.equal(parsed.combo?.player.sport, "Basketball", query);
      assert.equal(parsed.combo?.insert, "Downtown", query);
    }
  });

  it("parses 'Nabers Kaboom' into player + insert, and Kaboom! is the same chip", () => {
    for (const query of ["Nabers Kaboom", "Malik Nabers Kaboom", "Malik Nabers Kaboom!", "Kaboom Malik Nabers"]) {
      const parsed = parseDoorQuery(query, INDEXED_DIRECTORY);
      assert.equal(parsed.insert, "Kaboom", query);
      assert.equal(parsed.combo?.player.name, "Malik Nabers", query);
      assert.equal(parsed.combo?.player.sport, "Football", query);
    }
    const enter = doorEnterPick("Malik Nabers Kaboom", parseDoorQuery("Malik Nabers Kaboom", INDEXED_DIRECTORY));
    assert.deepEqual(enter, { name: "Malik Nabers", sport: "Football", insert: "Kaboom" });
  });

  it("shows Downtown in Inserts before a set is picked", () => {
    const parsed = parseDoorQuery("downtown", INDEXED_DIRECTORY);
    assert.deepEqual(doorInserts("downtown", parsed), ["Downtown"]);
    assert.deepEqual(doorInserts("kab", parseDoorQuery("kab", INDEXED_DIRECTORY)), ["Kaboom"]);
    assert.deepEqual(doorInserts("color bl", parseDoorQuery("color bl", INDEXED_DIRECTORY)), ["Color Blast"]);
    assert.deepEqual(doorInserts("wembanyama", parseDoorQuery("wembanyama", INDEXED_DIRECTORY)), []);
  });

  it("keeps a plain player name a plain player search", () => {
    const parsed = parseDoorQuery("Victor Wembanyama", INDEXED_DIRECTORY);
    assert.equal(parsed.insert, null);
    assert.equal(parsed.combo, null);
    assert.equal(parsed.players[0]?.name, "Victor Wembanyama");
    assert.deepEqual(doorEnterPick("Victor Wembanyama", parsed), {
      name: "Victor Wembanyama",
      sport: "Basketball",
      insert: null,
    });
  });

  it("still uses a typed name that is not on a roster", () => {
    const parsed = parseDoorQuery("Qa Notarealplayer", INDEXED_DIRECTORY);
    assert.equal(doorTypedName("Qa Notarealplayer", parsed), "Qa Notarealplayer");
    assert.equal(doorEnterPick("Qa Notarealplayer", parsed)?.name, "Qa Notarealplayer");
    const withInsert = parseDoorQuery("Qa Notarealplayer Kaboom", INDEXED_DIRECTORY);
    assert.equal(doorTypedName("Qa Notarealplayer Kaboom", withInsert), "Qa Notarealplayer");
  });

  it("finds sets by name and waits for enough characters before the catalog call", () => {
    assert.ok(doorSets("optic").includes("Donruss Optic"));
    assert.deepEqual(doorSets("o"), []);
    assert.equal(doorWantsCatalog("ab"), false);
    assert.equal(doorWantsCatalog("a".repeat(DOOR_CATALOG_MIN_CHARS)), true);
  });

  it("remembers the typed search for this draft only", () => {
    clearDoorQuery();
    writeDoorQuery("user\nseed", "Maxey Down");
    assert.equal(readDoorQuery("user\nseed"), "Maxey Down");
    assert.equal(readDoorQuery("other\nseed"), "");
    clearDoorQuery();
    assert.equal(readDoorQuery("user\nseed"), "");
  });
});

describe("search door: step jumps", () => {
  it("a player pick starts Year, as today", () => {
    const answers = answersWithPatch(emptyFlowAnswers(), answerPlayer("Victor Wembanyama", "Basketball"));
    assert.equal(nextStep(initialFlowState(), answers).step, "year");
  });

  it("player + insert fills both and goes to Year, with the insert's sets first", () => {
    const empty = emptyFlowAnswers();
    const player = answerPlayer("Tyrese Maxey", "Basketball");
    const insert = answerParallel("", "Downtown", null, empty);
    assert.equal(insert.form.parallel, "Downtown");
    assert.equal(insert.parallelIsCustom, true, "a seed insert saves as a custom parallel");
    const answers = answersWithPatch(empty, { form: { ...player.form, ...insert.form } }, null);
    const state = nextStep(initialFlowState(), answers);
    assert.equal(state.step, "year");
    assert.equal(answers.playerName, "Tyrese Maxey");
    assert.equal(answers.parallel, "Downtown");
    const sets = setChoices({ sport: "Basketball", catalogSets: [], productSets: [], insert: "Downtown" });
    assert.equal(sets[0]?.name, "Donruss Optic");
    const kaboom = setChoices({ sport: "Football", catalogSets: [], productSets: [], insert: "Kaboom" });
    assert.deepEqual(
      kaboom.slice(0, 3).map((item) => item.name),
      ["Panini Donruss", "Donruss Optic", "Panini Absolute"],
    );
    // Other sets are still there.
    assert.ok(kaboom.some((item) => item.name === "Panini Prizm"));
  });

  it("Kaboom! stores as Kaboom", () => {
    assert.equal(answerParallel("Panini Donruss", "Kaboom!", null, emptyFlowAnswers()).form.parallel, "Kaboom");
  });

  it("a catalog pick still jumps to Parallel, and Back returns to the door", () => {
    const card: CatalogCard = {
      id: "cat-1",
      playerName: "Victor Wembanyama",
      yearLabel: "2023-24",
      setBrand: "Panini Prizm",
      cardNumber: "136",
      sport: "Basketball",
      parallel: "Base",
    };
    const jumped = catalogJump(initialFlowState(), emptyFlowAnswers(), card);
    assert.equal(jumped.state.step, "parallel");
    assert.equal(jumped.answers.setBrand, "Panini Prizm");
    assert.equal(backStep(jumped.state).step, "player");
  });

  it("step by step still walks Player → Year → Set → Card # → Parallel", () => {
    let answers = emptyFlowAnswers();
    let state = initialFlowState();
    assert.equal(openingStep(answers), "player");
    answers = answersWithPatch(answers, answerPlayer("Zach Neto", "Baseball"));
    state = nextStep(state, answers);
    assert.equal(state.step, "year");
    answers = { ...answers, yearLabel: "2024" };
    state = nextStep(state, answers);
    assert.equal(state.step, "set");
    answers = { ...answers, setBrand: "Topps Chrome" };
    state = nextStep(state, answers);
    assert.equal(state.step, "number");
    answers = { ...answers, cardNumber: "44" };
    state = nextStep(state, answers);
    assert.equal(state.step, "parallel");
  });
});
