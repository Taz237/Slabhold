import type { CatalogCard } from "@/lib/card-catalog";
import { SETS, isValidCardNumber, isValidYear, yearOptionsForSport } from "@/lib/card-options";
import { catalogPickFields } from "@/lib/catalog/catalog-pick";
import { RAW_GRADING_COMPANY, isRawGradingCompany } from "@/lib/cards/grading-company";
import type { CardDraftForm } from "@/lib/cards/new-card-draft";
import {
  parallelAfterSetChange,
  parallelChoice,
  parallelMatchKey,
  parallelsForSet,
} from "@/lib/cards/parallels";
import { NOT_SURE_PARALLEL, serialRunFromName } from "@/lib/value/match-confidence";

/**
 * The guided Add card picker: one question per screen.
 * Pure, so the UI only renders it. Answers write into the same form
 * fields CardForm saves, so the save path does not change.
 */
export const ADD_FLOW_STEPS = [
  "player",
  "year",
  "set",
  "number",
  "parallel",
  "serial",
  "grade",
  "review",
] as const;

export type AddFlowStep = (typeof ADD_FLOW_STEPS)[number];

/** Add card header subline for the picker. */
export const ADD_FLOW_SUBLINE = "Snap a photo, then a few quick taps.";

export const STEP_LABELS: Record<AddFlowStep, string> = {
  player: "Player",
  year: "Year",
  set: "Set",
  number: "Card #",
  parallel: "Parallel",
  serial: "Numbered?",
  grade: "Grade",
  review: "Review",
};

export const STEP_QUESTIONS: Record<AddFlowStep, string> = {
  player: "Who's on the card?",
  year: "What year is it?",
  set: "Which set?",
  number: "What's the card number?",
  parallel: "Which parallel?",
  serial: "Is it numbered?",
  grade: "Graded or raw?",
  review: "Look right?",
};

/** The form values each step reads. Built from CardForm state on every render. */
export type FlowAnswers = {
  playerName: string;
  sport: string;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  noNumber: boolean;
  parallel: string;
  serialRun: string;
  serialNo: string;
  gradeCompany: string;
  gradeNumber: string;
  /** Checklist run for the chosen parallel. Null when unnumbered or not in the checklist. */
  knownRun: number | null;
};

export function emptyFlowAnswers(): FlowAnswers {
  return {
    playerName: "",
    sport: "Basketball",
    yearLabel: "",
    setBrand: "",
    cardNumber: "",
    noNumber: false,
    parallel: "Base",
    serialRun: "",
    serialNo: "",
    gradeCompany: RAW_GRADING_COMPANY,
    gradeNumber: "",
    knownRun: null,
  };
}

export type FlowState = {
  step: AddFlowStep;
  /** Steps answered on the way here, oldest first. Back pops one. */
  history: AddFlowStep[];
  /** Opened from Review: the next answer goes back to Review. */
  returnToReview: boolean;
};

export function initialFlowState(step: AddFlowStep = "player"): FlowState {
  return { step, history: [], returnToReview: false };
}

/** Numbered? is skipped when the checklist already knows the run. */
export function stepSkipped(step: AddFlowStep, answers: FlowAnswers): boolean {
  if (step === "serial") return answers.knownRun != null;
  return false;
}

export function gradeNeedsNumber(company: string): boolean {
  return !isRawGradingCompany(company);
}

export function stepComplete(step: AddFlowStep, answers: FlowAnswers): boolean {
  switch (step) {
    case "player":
      return answers.playerName.trim() !== "";
    case "year":
      return isValidYear(answers.yearLabel);
    case "set":
      return answers.setBrand.trim() !== "";
    case "number":
      return answers.noNumber || isValidCardNumber(answers.cardNumber);
    case "parallel":
      return answers.parallel.trim() !== "";
    case "serial":
      return serialNoError(answers.serialNo, answers.serialRun) == null;
    case "grade":
      return !gradeNeedsNumber(answers.gradeCompany) || answers.gradeNumber.trim() !== "";
    case "review":
      return ADD_FLOW_STEPS.every((item) => item === "review" || stepComplete(item, answers));
  }
}

function visibleSteps(answers: FlowAnswers): AddFlowStep[] {
  return ADD_FLOW_STEPS.filter((step) => !stepSkipped(step, answers));
}

/** The first step still missing an answer, or Review. Used to resume a restored draft. */
export function resumeStep(answers: FlowAnswers): AddFlowStep {
  return (
    visibleSteps(answers).find((step) => step !== "review" && !stepComplete(step, answers)) ??
    "review"
  );
}

export function nextStep(state: FlowState, answers: FlowAnswers): FlowState {
  if (state.step === "review") return state;
  const history = [...state.history, state.step];
  if (state.returnToReview) {
    const missing = resumeStep(answers);
    // A change that opened a new question (a new parallel with no run) asks it first.
    const target = missing === "review" ? "review" : missing;
    return { step: target, history, returnToReview: target !== "review" };
  }
  const steps = visibleSteps(answers);
  const from = ADD_FLOW_STEPS.indexOf(state.step);
  const target = steps.find((step) => ADD_FLOW_STEPS.indexOf(step) > from) ?? "review";
  return { step: target, history, returnToReview: false };
}

export function backStep(state: FlowState): FlowState {
  if (state.history.length === 0) return state;
  const history = state.history.slice(0, -1);
  const step = state.history[state.history.length - 1];
  return { step, history, returnToReview: state.returnToReview && step !== "review" };
}

/** Tap a part of the Review summary, or the progress bar, to change that answer. */
export function jumpToStep(state: FlowState, step: AddFlowStep): FlowState {
  if (step === state.step) return state;
  return {
    step,
    history: [...state.history, state.step],
    returnToReview: state.step === "review" || state.returnToReview,
  };
}

/** 0 on the first step, 1 on Review. */
export function flowProgress(state: FlowState, answers: FlowAnswers): number {
  const steps = visibleSteps(answers);
  const index = steps.indexOf(state.step);
  if (index < 0) return 0;
  return steps.length <= 1 ? 1 : index / (steps.length - 1);
}

/** A patch for CardForm. Only fields that change are present. */
export type FlowPatch = {
  form?: Partial<CardDraftForm>;
  noNumber?: boolean;
  setIsCustom?: boolean;
  parallelIsCustom?: boolean;
  isAuto?: boolean;
  gradeCompany?: string;
  gradeNumber?: string;
};

export function answerPlayer(name: string, sport: string | null | undefined): FlowPatch {
  const form: Partial<CardDraftForm> = { playerName: name.trim().replace(/\s+/g, " ") };
  if (sport?.trim()) form.sport = sport.trim();
  return { form };
}

export function answerYear(yearLabel: string): FlowPatch {
  return { form: { yearLabel: yearLabel.trim() } };
}

/** Same rules as the set field: an unlisted name is custom, and the parallel resets if the set lacks it. */
export function answerSet(
  setBrand: string,
  answers: FlowAnswers,
  parallelIsCustom: boolean,
): FlowPatch & { form: Partial<CardDraftForm>; setIsCustom: boolean } {
  const name = setBrand.trim();
  const known = SETS.some((item) => item.toLowerCase() === name.toLowerCase());
  const next = parallelAfterSetChange({
    parallel: answers.parallel,
    parallelIsCustom,
    setBrand: name,
  });
  const form: Partial<CardDraftForm> = { setBrand: name, parallel: next.parallel };
  if (parallelMatchKey(next.parallel) !== parallelMatchKey(answers.parallel)) {
    form.serialRun = "";
    form.serialNo = "";
  }
  return {
    form,
    setIsCustom: Boolean(name) && !known,
    parallelIsCustom: next.parallelIsCustom,
  };
}

export function answerCardNumber(cardNumber: string, noNumber: boolean): FlowPatch {
  if (noNumber) return { form: { cardNumber: "" }, noNumber: true };
  return { form: { cardNumber: cardNumber.replace(/^#/, "") }, noNumber: false };
}

/** A checklist run fills Numbered? for you. A different parallel clears an old run. */
export function answerParallel(
  setBrand: string,
  parallel: string,
  knownRun: number | null,
  answers: FlowAnswers,
): FlowPatch & { form: Partial<CardDraftForm>; parallelIsCustom: boolean } {
  const chosen = parallelChoice(setBrand, parallel);
  const form: Partial<CardDraftForm> = { parallel: chosen.parallel };
  const changed = parallelMatchKey(chosen.parallel) !== parallelMatchKey(answers.parallel);
  if (knownRun != null) {
    form.serialRun = String(knownRun);
    const no = Number(answers.serialNo);
    if (answers.serialNo && !(Number.isInteger(no) && no >= 1 && no <= knownRun)) form.serialNo = "";
  } else if (changed) {
    form.serialRun = "";
    form.serialNo = "";
  }
  return { form, parallelIsCustom: chosen.parallelIsCustom };
}

export function answerNotSureParallel(): FlowPatch & {
  form: Partial<CardDraftForm>;
  parallelIsCustom: true;
} {
  return {
    form: { parallel: NOT_SURE_PARALLEL, serialRun: "", serialNo: "" },
    parallelIsCustom: true,
  };
}

export const SERIAL_RUN_CHIPS = [99, 75, 50, 25, 10, 5] as const;

export type SerialChoice =
  | { kind: "none" }
  | { kind: "run"; run: number }
  | { kind: "one_of_one" }
  | { kind: "unsure" };

export function answerSerial(
  choice: SerialChoice,
  answers: FlowAnswers,
): FlowPatch & { form: Pick<CardDraftForm, "serialRun" | "serialNo"> } {
  switch (choice.kind) {
    case "none":
    case "unsure":
      return { form: { serialRun: "", serialNo: "" } };
    case "one_of_one":
      return { form: { serialRun: "1", serialNo: "1" } };
    case "run": {
      const run = Math.floor(choice.run);
      const keep = serialNoError(answers.serialNo, String(run)) == null ? answers.serialNo : "";
      return { form: { serialRun: String(run), serialNo: keep } };
    }
  }
}

/** "Your number" is optional. When given it must be a whole number from 1 to the run. */
export function serialNoError(serialNo: string, serialRun: string): string | null {
  const text = serialNo.trim();
  if (!text) return null;
  const run = Number(serialRun);
  const no = Number(text);
  const runOk = Number.isInteger(run) && run >= 1;
  if (!runOk) return "Pick the print run first.";
  if (!/^\d+$/.test(text) || !Number.isInteger(no) || no < 1 || no > run) {
    return `Your number must be between 1 and ${run}.`;
  }
  return null;
}

/** Grade companies on the chips. Raw is the default and needs no number. */
export const GRADE_CHIP_COMPANIES = [
  { label: "Raw", value: RAW_GRADING_COMPANY },
  { label: "PSA", value: "PSA" },
  { label: "BGS", value: "BGS" },
  { label: "SGC", value: "SGC" },
  { label: "CGC", value: "CGC" },
  { label: "TAG", value: "TAG" },
  { label: "Other", value: "Other" },
] as const;

/** "Not sure" counts as Raw. Raw moves on; a grader waits for its number. */
export function answerGradeCompany(company: string): { gradeCompany: string; advance: boolean } {
  const listed = GRADE_CHIP_COMPANIES.find(
    (item) => item.value.toLowerCase() === company.trim().toLowerCase(),
  );
  const value = listed && listed.value !== RAW_GRADING_COMPANY ? listed.value : RAW_GRADING_COMPANY;
  return { gradeCompany: value, advance: !gradeNeedsNumber(value) };
}

/**
 * A catalog card picked from Year's "Not sure": year, set and number are filled
 * and the flow lands on Parallel. Back still goes to Year.
 */
export function catalogJump(
  state: FlowState,
  answers: FlowAnswers,
  card: CatalogCard,
): { state: FlowState; answers: FlowAnswers } {
  const picked = catalogPickFields(card, "");
  return {
    state: {
      step: "parallel",
      history: [...state.history, state.step],
      returnToReview: false,
    },
    answers: {
      ...answers,
      playerName: picked.form.playerName,
      yearLabel: picked.form.yearLabel,
      setBrand: picked.form.setBrand,
      cardNumber: picked.form.cardNumber,
      noNumber: false,
      parallel: picked.form.parallel,
      sport: picked.form.sport || answers.sport,
    },
  };
}

export type ReviewPart = { text: string; step: AddFlowStep | null };

function gradeText(answers: FlowAnswers): string {
  if (!gradeNeedsNumber(answers.gradeCompany)) return "Raw";
  return [answers.gradeCompany.trim(), answers.gradeNumber.trim()].filter(Boolean).join(" ");
}

/** "2024 Panini Prizm · #SS-ZN · Red /99 · Auto · Raw", split so each part can be tapped. */
export function reviewParts(answers: FlowAnswers, extras: { isAuto: boolean }): ReviewPart[] {
  const parts: ReviewPart[] = [];
  const dot = () => parts.push({ text: " · ", step: null });
  parts.push({ text: answers.yearLabel.trim() || "Year?", step: "year" });
  parts.push({ text: " ", step: null });
  parts.push({ text: answers.setBrand.trim() || "Set?", step: "set" });
  dot();
  parts.push({
    text: answers.noNumber ? "No number" : `#${answers.cardNumber.trim().toUpperCase() || "?"}`,
    step: "number",
  });
  dot();
  parts.push({ text: answers.parallel.trim() || "Base", step: "parallel" });
  const run = Number(answers.serialRun);
  if (Number.isInteger(run) && run >= 1) {
    parts.push({ text: " ", step: null });
    const no = answers.serialNo.trim();
    parts.push({ text: run === 1 ? "1/1" : `${no ? no : ""}/${run}`, step: "serial" });
  }
  if (extras.isAuto) {
    dot();
    parts.push({ text: "Auto", step: "parallel" });
  }
  dot();
  parts.push({ text: gradeText(answers), step: "grade" });
  return parts;
}

/** Seasons on the Year step before "Older…". */
export const YEAR_CHIP_COUNT = 12;

export function yearChips(sport: string): string[] {
  const seasons = sport === "Basketball" || sport === "Hockey";
  return yearOptionsForSport(sport)
    .filter((label) => (seasons ? label.includes("-") : !label.includes("-")))
    .slice(0, YEAR_CHIP_COUNT);
}

function playerKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Catalog rows that are this player. search_cards also returns near names. */
export function catalogRowsForPlayer(rows: readonly CatalogCard[], playerName: string): CatalogCard[] {
  const key = playerKey(playerName);
  if (!key) return [];
  return rows.filter((row) => playerKey(row.playerName) === key);
}

export function catalogYears(rows: readonly CatalogCard[]): string[] {
  const years = [...new Set(rows.map((row) => row.yearLabel.trim()).filter(isValidYear))];
  return years.sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
}

/** Who makes a set. Text only, never a logo. Blank when we can't tell. */
export function setMaker(name: string): string {
  const text = name.toLowerCase();
  if (/\b(topps|bowman)/.test(text)) return "Topps";
  if (/\b(panini|donruss|prizm|select|mosaic|optic|hoops|court kings|contenders|national treasures|immaculate|flawless|chronicles|spectra|absolute|phoenix|obsidian|revolution|certified)\b/.test(text)) {
    return "Panini";
  }
  if (/\b(upper deck|o-pee-chee)\b/.test(text)) return "Upper Deck";
  if (/\bfleer\b|\bskybox\b/.test(text)) return "Fleer";
  if (/\bscore\b/.test(text)) return "Score";
  if (/\bleaf\b/.test(text)) return "Leaf";
  return "";
}

/** Sets people add most, by sport. Topps and Panini both, until Topps checklists land. */
const POPULAR_SETS: Record<string, readonly string[]> = {
  Basketball: ["Panini Prizm", "Donruss Optic", "Panini Select", "Hoops", "Panini Mosaic", "Topps Chrome"],
  Football: ["Panini Prizm", "Donruss Optic", "Panini Select", "Panini Mosaic", "Panini Donruss", "Topps Chrome"],
  Baseball: ["Topps Series 1", "Topps Chrome", "Topps Update", "Bowman Chrome", "Bowman", "Topps Heritage"],
  Hockey: ["Upper Deck", "Upper Deck Series 1", "O-Pee-Chee", "Upper Deck SP Authentic"],
  Soccer: ["Topps Chrome", "Panini Prizm", "Panini Select"],
};

const FEATURED_SET_MAX = 10;

export type SetChoice = {
  name: string;
  maker: string;
  source: "catalog" | "checklist" | "popular";
};

/** Catalog sets for this player and year, then checklist sets, then popular ones. The rest live in the search sheet. */
export function setChoices(input: {
  sport: string;
  catalogSets: readonly string[];
  productSets: readonly string[];
}): SetChoice[] {
  const seen = new Set<string>();
  const out: SetChoice[] = [];
  const add = (name: string, source: SetChoice["source"]) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key) || out.length >= FEATURED_SET_MAX) return;
    seen.add(key);
    out.push({ name: name.trim(), maker: setMaker(name), source });
  };
  for (const name of input.catalogSets) add(name, "catalog");
  for (const name of input.productSets) add(name, "checklist");
  for (const name of POPULAR_SETS[input.sport] ?? POPULAR_SETS.Basketball) add(name, "popular");
  return out;
}

export type ParallelOption = { name: string; serialRun: number | null; runVaries?: true };

/** Checklist parallels when we have them, else the built-in list. A custom pick stays on the list. */
export function parallelOptions(
  checklist: readonly ParallelOption[] | null,
  setBrand: string,
  current: string,
): ParallelOption[] {
  const list: ParallelOption[] = checklist?.length
    ? checklist.map((item) => ({ ...item }))
    : parallelsForSet(setBrand).map((name) => ({ name, serialRun: serialRunFromName(name) }));
  const key = parallelMatchKey(current);
  if (key && key !== parallelMatchKey(NOT_SURE_PARALLEL) && !list.some((item) => parallelMatchKey(item.name) === key)) {
    list.push({ name: current.trim(), serialRun: serialRunFromName(current) });
  }
  return list;
}

/** The answers after a patch, so the next step can be chosen before React re-renders. */
export function answersWithPatch(
  answers: FlowAnswers,
  patch: FlowPatch,
  knownRun: number | null = answers.knownRun,
): FlowAnswers {
  const form = patch.form ?? {};
  return {
    ...answers,
    playerName: form.playerName ?? answers.playerName,
    sport: form.sport ?? answers.sport,
    yearLabel: form.yearLabel ?? answers.yearLabel,
    setBrand: form.setBrand ?? answers.setBrand,
    cardNumber: form.cardNumber ?? answers.cardNumber,
    parallel: form.parallel ?? answers.parallel,
    serialRun: form.serialRun ?? answers.serialRun,
    serialNo: form.serialNo ?? answers.serialNo,
    noNumber: patch.noNumber ?? answers.noNumber,
    gradeCompany: patch.gradeCompany ?? answers.gradeCompany,
    gradeNumber: patch.gradeNumber ?? answers.gradeNumber,
    knownRun,
  };
}

let position: { key: string; state: FlowState } | null = null;

/** Where the picker was, so a remount with a restored draft lands on the same question. */
export function readFlowPosition(key: string | null): FlowState | null {
  if (!key || !position || position.key !== key) return null;
  return position.state;
}

export function writeFlowPosition(key: string | null, state: FlowState): void {
  if (!key) return;
  position = { key, state };
}

export function clearFlowPosition(): void {
  position = null;
}

/** A state on `step` as if every visible step before it was answered, so Back walks them. */
export function flowStateAt(step: AddFlowStep, answers: FlowAnswers): FlowState {
  const index = ADD_FLOW_STEPS.indexOf(step);
  return {
    step,
    history: visibleSteps(answers).filter((item) => ADD_FLOW_STEPS.indexOf(item) < index),
    returnToReview: false,
  };
}

/**
 * Where the picker opens. A card picked on Search already has player, year,
 * set and number, so it opens on Parallel. Otherwise the first unanswered step.
 */
export function openingStep(answers: FlowAnswers): AddFlowStep {
  const picked = (["player", "year", "set", "number"] as const).every((step) =>
    stepComplete(step, answers),
  );
  if (picked) return "parallel";
  const first = resumeStep(answers);
  return first === "review" ? "player" : first;
}
