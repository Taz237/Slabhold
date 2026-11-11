"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil } from "lucide-react";
import {
  BackButton,
  DraftSlab,
  FlowProgress,
  QuietButton,
  RunBadge,
  StepDock,
  SwatchDot,
  focusRing,
} from "@/components/add-card/flow-ui";
import { ConditionRow, GradeStep, NumberStep, ParallelStep, SerialStep } from "@/components/add-card/detail-steps";
import { PlayerStep, type PlayerPick } from "@/components/add-card/player-step";
import { ReviewValue } from "@/components/add-card/review-value";
import { SearchDoor, type DoorPick } from "@/components/add-card/search-door";
import { SetStep } from "@/components/add-card/set-step";
import { useProductData } from "@/lib/cards/use-product-data";
import { rememberPlayer, useRecentPlayers } from "@/components/add-card/use-recent-players";
import { YearStep } from "@/components/add-card/year-step";
import { useCollection } from "@/components/collection-provider";
import type { ArtCard } from "@/components/card-slab-art";
import { searchCatalog, type CatalogCard } from "@/lib/card-catalog";
import { parseYearLabel } from "@/lib/card-options";
import {
  STEP_BY_STEP_QUESTION,
  STEP_LABELS,
  STEP_QUESTIONS,
  answerCardNumber,
  answerGradeCompany,
  answerNotSureParallel,
  answerParallel,
  answerPlayer,
  answerSerial,
  answerSet,
  answerYear,
  answersWithPatch,
  backStep,
  catalogJump,
  catalogRowsForPlayer,
  flowCounter,
  flowProgress,
  gradeNeedsNumber,
  flowStateAt,
  jumpToStep,
  nextStep,
  openingStep,
  parallelGroups,
  readFlowPosition,
  resumeStep,
  reviewMissing,
  reviewNumberedPart,
  reviewParts,
  setChoices,
  stepComplete,
  writeFlowPosition,
  clearFlowPosition,
  type AddFlowStep,
  type FlowAnswers,
  type FlowPatch,
  type FlowState,
  type ParallelOption,
} from "@/lib/cards/add-flow";
import { collectionPlayers } from "@/lib/cards/add-flow-players";
import type { AddLastUsed } from "@/lib/cards/add-last-used";
import { CARD_PAGE_PREFETCH_PATH } from "@/lib/cards/added-panel";
import { clearDoorQuery, readDoorQuery, writeDoorQuery } from "@/lib/cards/add-door";
import { seedInsert } from "@/lib/cards/data/popular-inserts";
import { applyGradingCompany } from "@/lib/cards/grading-company";
import type { CardDraftForm } from "@/lib/cards/new-card-draft";
import { parallelIn, parallelsIn, sameSeason, serialRunIn, setNamesIn } from "@/lib/cards/product-data";
import { searchCatalogRemote } from "@/lib/catalog/search-remote";

export type AddCardFlowProps = {
  /** The id of CardForm's form, for the Add button when it sits above the keyboard. */
  formId?: string;
  form: CardDraftForm;
  noNumber: boolean;
  parallelIsCustom: boolean;
  isAuto: boolean;
  gradeCompany: string;
  gradeNumber: string;
  gradeQualifier: string;
  certNumber: string;
  photo: string | null;
  accent: string;
  saving: boolean;
  readingPhoto: boolean;
  /** A draft was restored when Add card opened. */
  resumed: boolean;
  /** Opened from "Add another" with player, year and set already filled. */
  prefilled?: boolean;
  /** Keys the remembered step to this draft and user. */
  positionKey: string | null;
  /** This person's last saved answers, for the pre-selected chips. Null when signed out. */
  lastUsed?: AddLastUsed | null;
  apply: (patch: FlowPatch) => void;
  /** The cert number on Review's Condition row. Same state CardForm saves. */
  onCertNumber: (value: string) => void;
  pickCatalog: (card: CatalogCard) => void;
  onStartOver: () => void;
  header: ReactNode;
  photoBlock: ReactNode;
  moreDetails: ReactNode;
  moreOpen: boolean;
  onMoreOpen: (open: boolean) => void;
  sportOffer: ReactNode;
  saveError: ReactNode;
  /** "Also post to my feed", shown on Review next to Public / Private. */
  feedPost?: ReactNode;
};

const STEP_IN = "motion-safe:animate-[add-step-in_220ms_cubic-bezier(0.2,0.7,0.2,1)_both]";
const STEP_BACK = "motion-safe:animate-[add-step-back_220ms_cubic-bezier(0.2,0.7,0.2,1)_both]";
/** Reduced motion: no slide, just a short fade. */
const STEP_FADE = "motion-reduce:animate-[add-fade_150ms_linear_both]";

/**
 * The control a step hands focus to: its marked input or answer, else the
 * pre-selected chip, else the first chip, else the first field.
 */
function stepFocusTarget(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  return (
    root.querySelector<HTMLElement>("[data-step-focus]:not([disabled])") ??
    root.querySelector<HTMLElement>('button[aria-pressed="true"]') ??
    root.querySelector<HTMLElement>("button[aria-pressed]") ??
    root.querySelector<HTMLElement>("input:not([type=checkbox]):not([disabled]), button")
  );
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

/**
 * Add card as a guided picker: Player → Year → Set → Card # → Parallel →
 * Review. Numbered? shows only for a parallel that can be numbered, and the
 * grade is picked on Review. CardForm keeps the state, the draft and the save;
 * this only asks one question at a time and writes the answers back.
 */
export function AddCardFlow(props: AddCardFlowProps) {
  const { form } = props;
  const router = useRouter();
  const { cards } = useCollection();
  const recent = useRecentPlayers();
  const products = useProductData(form.playerName.trim() !== "");
  const headingId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const gradesRef = useRef<HTMLDivElement>(null);
  const firstPaint = useRef(true);
  const graderOffered = useRef(false);
  const [missingGrade, setMissingGrade] = useState(false);

  const knownRow = products.data
    ? parallelIn(products.data, form.sport, form.yearLabel, form.setBrand, form.parallel)
    : null;
  const knownRun = knownRow?.serialRun && knownRow.serialRun >= 1 ? knownRow.serialRun : null;
  const runVaries = Boolean(knownRow?.runVaries);

  const answers: FlowAnswers = {
    playerName: form.playerName,
    sport: form.sport,
    yearLabel: form.yearLabel,
    setBrand: form.setBrand,
    cardNumber: form.cardNumber,
    noNumber: props.noNumber,
    parallel: form.parallel,
    serialRun: form.serialRun,
    serialNo: form.serialNo,
    gradeCompany: props.gradeCompany,
    gradeNumber: props.gradeNumber,
    knownRun,
    runVaries,
  };

  const [flow, setFlow] = useState<FlowState>(() => {
    if (props.resumed) {
      return readFlowPosition(props.positionKey) ?? flowStateAt(resumeStep(answers), answers);
    }
    return flowStateAt(openingStep(answers), answers);
  });
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [showStartOver, setShowStartOver] = useState(props.resumed || Boolean(props.prefilled));
  const [stepByStep, setStepByStep] = useState(false);

  // Their catalog cards: one search_cards call when a player is picked.
  const committedPlayer = flow.step === "player" ? "" : form.playerName.trim();
  const [catalog, setCatalog] = useState<{ player: string; rows: CatalogCard[] } | null>(null);
  const catalogFor = catalog?.player ?? null;
  useEffect(() => {
    if (!committedPlayer || catalogFor === committedPlayer) return;
    const controller = new AbortController();
    const settle = (rows: CatalogCard[] | null) => {
      if (controller.signal.aborted) return;
      const list = rows ?? searchCatalog(committedPlayer, 20);
      setCatalog({ player: committedPlayer, rows: catalogRowsForPlayer(list, committedPlayer) });
    };
    searchCatalogRemote(committedPlayer, controller.signal).then(settle, () => settle(null));
    return () => controller.abort();
  }, [committedPlayer, catalogFor]);
  const catalogRows = useMemo(
    () => (catalog && catalog.player === committedPlayer ? catalog.rows : []),
    [catalog, committedPlayer],
  );
  const catalogLoading = committedPlayer !== "" && catalogFor !== committedPlayer;

  // Focus moves forward with the flow: the step's field (so the keyboard opens)
  // or its pre-selected chip. A layout effect, so it lands inside the tap that
  // moved the step and iOS still opens the keyboard. The live region below
  // reads the question out.
  useLayoutEffect(() => {
    const first = firstPaint.current;
    firstPaint.current = false;
    // A fresh Add card: the search field has its own autofocus, under the photo buttons.
    if (first && flow.step === "player") return;
    const section = sectionRef.current;
    if (!first && section && section.getBoundingClientRect().top < 0) {
      section.scrollIntoView?.({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    }
    stepFocusTarget(stepRef.current)?.focus({ preventScroll: true });
  }, [flow.step]);

  // A finished Review warms the card page and the next Add card, so the save has no loading flash.
  const reviewReady = flow.step === "review" && stepComplete("review", answers);
  useEffect(() => {
    if (!reviewReady) return;
    try {
      router.prefetch(CARD_PAGE_PREFETCH_PATH);
      router.prefetch("/cards/new");
    } catch {
      // Prefetch is a nicety; the save works without it.
    }
  }, [reviewReady, router]);

  const owned = useMemo(() => {
    return collectionPlayers(cards).map((name) => ({
      name,
      sport: cards.find((card) => card.playerName.trim() === name)?.sport ?? "",
    }));
  }, [cards]);

  const setOptions = useMemo(
    () =>
      setChoices({
        sport: form.sport,
        catalogSets: parseYearLabel(form.yearLabel)
          ? catalogRows
              .filter((row) => sameSeason(row.yearLabel, form.yearLabel))
              .map((row) => row.setBrand)
          : [],
        productSets: products.data ? setNamesIn(products.data, form.sport, form.yearLabel) : [],
        insert: form.parallel,
        lastUsed: props.lastUsed?.set,
      }),
    [catalogRows, form.sport, form.yearLabel, form.parallel, products.data, props.lastUsed?.set],
  );

  const parallelList = useMemo(() => {
    const checklist = products.data
      ? parallelsIn(products.data, form.sport, form.yearLabel, form.setBrand)
      : null;
    return parallelGroups(checklist, form.setBrand, form.parallel);
  }, [products.data, form.sport, form.yearLabel, form.setBrand, form.parallel]);

  function go(next: FlowState, dir: "forward" | "back") {
    // The first time Review opens, the last-used grader is pre-selected, but
    // only when the last card was graded and this one still reads Raw.
    if (next.step === "review" && !graderOffered.current) {
      graderOffered.current = true;
      const grader = props.lastUsed?.grader ?? "";
      if (grader && !props.resumed && !gradeNeedsNumber(answers.gradeCompany)) {
        props.apply({ gradeCompany: grader });
      }
    }
    setDirection(dir);
    setFlow(next);
    writeFlowPosition(props.positionKey, next);
  }

  function advance(patch?: FlowPatch, run: number | null = knownRun, varies?: boolean) {
    if (patch) props.apply(patch);
    const nextAnswers = patch ? answersWithPatch(answers, patch, run, varies) : answers;
    go(nextStep(flow, nextAnswers), "forward");
  }

  function back() {
    go(backStep(flow), "back");
  }

  function jump(step: AddFlowStep) {
    go(jumpToStep(flow, step), "back");
  }

  /** Brings the grade chips into view and focuses the first one. */
  function focusGrades() {
    const grades = gradesRef.current;
    if (!grades) return;
    grades.scrollIntoView?.({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    grades.querySelector<HTMLElement>('button[aria-pressed="true"], button')?.focus({ preventScroll: true });
  }

  /** Add tapped with something missing: fix it in place, or open that one step and come back. */
  function finishReview() {
    const missing = reviewMissing(answers);
    if (missing === "grade") {
      setMissingGrade(true);
      focusGrades();
      return;
    }
    if (missing) go(jumpToStep(flow, missing), "forward");
  }

  function pickGradeCompany(company: string) {
    const picked = answerGradeCompany(company);
    setMissingGrade(false);
    props.apply({ gradeCompany: picked.gradeCompany });
  }

  function startOver() {
    props.onStartOver();
    clearFlowPosition();
    clearDoorQuery();
    setStepByStep(false);
    setShowStartOver(false);
    go(flowStateAt("player", answers), "back");
  }

  function pickPlayer(pick: PlayerPick) {
    rememberPlayer(pick.name);
    advance(answerPlayer(pick.name, pick.sport));
  }

  function pickCatalog(card: CatalogCard) {
    props.pickCatalog(card);
    const jumped = catalogJump(flow, answers, card);
    // An insert picked on the door stays when the catalog row is the base card.
    const insert = seedInsert(form.parallel);
    if (flow.step === "player" && insert && jumped.answers.parallel.trim().toLowerCase() === "base") {
      props.apply(answerParallel(card.setBrand, insert.name, null, jumped.answers));
    }
    clearDoorQuery();
    go(jumped.state, "forward");
  }

  /** A door pick: the player, plus the insert when the search named one ("Maxey Downtown"). */
  function pickFromDoor(pick: DoorPick) {
    rememberPlayer(pick.name);
    clearDoorQuery();
    const player = answerPlayer(pick.name, pick.sport);
    if (!pick.insert) {
      advance(player);
      return;
    }
    const insert = answerParallel(form.setBrand, pick.insert, null, answers);
    advance({ form: { ...player.form, ...insert.form }, parallelIsCustom: insert.parallelIsCustom }, null);
  }

  function pickDoorInsert(name: string | null) {
    props.apply(answerParallel(form.setBrand, name ?? "Base", null, answers));
  }

  function pickDoorSet(name: string | null) {
    props.apply(answerSet(name ?? "", answers, props.parallelIsCustom));
  }

  function pickSet(name: string) {
    const patch = answerSet(name, answers, props.parallelIsCustom);
    const parallel = patch.form.parallel ?? form.parallel;
    const run = products.data
      ? serialRunIn(products.data, form.sport, form.yearLabel, name, parallel)
      : null;
    const varies = products.data
      ? Boolean(parallelIn(products.data, form.sport, form.yearLabel, name, parallel)?.runVaries)
      : false;
    advance(patch, run, varies);
  }

  function pickParallel(option: ParallelOption) {
    const run = products.data
      ? serialRunIn(products.data, form.sport, form.yearLabel, form.setBrand, option.name)
      : option.runVaries
        ? null
        : option.serialRun;
    const varies = products.data
      ? Boolean(parallelIn(products.data, form.sport, form.yearLabel, form.setBrand, option.name)?.runVaries)
      : Boolean(option.runVaries);
    advance(answerParallel(form.setBrand, option.name, run, answers), run, varies);
  }

  const count = flowCounter(flow, answers);
  const counter = count.kind === "review" ? "Review" : `Step ${count.index} of ${count.total}`;
  const animation = `${direction === "back" ? STEP_BACK : STEP_IN} ${STEP_FADE}`;
  const question = flow.step === "player" && stepByStep ? STEP_BY_STEP_QUESTION : STEP_QUESTIONS[flow.step];
  const grading = applyGradingCompany({ company: props.gradeCompany, gradeNumber: props.gradeNumber });
  const parsedYear = parseYearLabel(form.yearLabel);
  const art: ArtCard = {
    playerName: form.playerName.trim() || "Your card",
    year: parsedYear?.year ?? 0,
    yearLabel: parsedYear?.yearLabel ?? "",
    setBrand: form.setBrand.trim(),
    grade: grading.grade,
    conditionType: grading.conditionType,
    grader: grading.grader ?? undefined,
    gradeQualifier: grading.conditionType === "graded" ? props.gradeQualifier : "",
    certNumber: grading.conditionType === "graded" ? props.certNumber : "",
    accent: props.accent,
  };
  const run = Number(form.serialRun);
  const runShown = Number.isInteger(run) && run >= 1 ? run : null;

  let body: ReactNode = null;
  switch (flow.step) {
    case "player":
      body = stepByStep ? (
        <PlayerStep
          initial={form.playerName}
          recent={recent}
          owned={owned}
          onPick={pickPlayer}
        />
      ) : (
        <SearchDoor
          initialQuery={readDoorQuery(props.positionKey) || form.playerName}
          recent={recent}
          owned={owned}
          insert={seedInsert(form.parallel)?.name ?? null}
          setBrand={form.setBrand}
          onQuery={(query) => writeDoorQuery(props.positionKey, query)}
          onPickPlayer={pickFromDoor}
          onPickInsert={pickDoorInsert}
          onPickSet={pickDoorSet}
          onPickCatalog={pickCatalog}
          onStepByStep={() => setStepByStep(true)}
        />
      );
      break;
    case "year":
      body = (
        <YearStep
          sport={form.sport}
          value={form.yearLabel}
          lastUsed={props.lastUsed?.year}
          catalog={catalogRows}
          catalogLoading={catalogLoading}
          onPick={(year) => advance(answerYear(year))}
          onCatalogPick={pickCatalog}
        />
      );
      break;
    case "set":
      body = (
        <SetStep
          value={form.setBrand}
          choices={setOptions}
          loading={products.loading || catalogLoading}
          onPick={pickSet}
        />
      );
      break;
    case "number":
      body = (
        <NumberStep
          value={form.cardNumber}
          noNumber={props.noNumber}
          onChange={(value) => props.apply(answerCardNumber(value, false))}
          onNoNumber={(noNumber) => props.apply(answerCardNumber(form.cardNumber, noNumber))}
          onNext={() => advance()}
        />
      );
      break;
    case "parallel":
      body = (
        <ParallelStep
          value={form.parallel}
          groups={parallelList}
          loading={products.loading}
          isAuto={props.isAuto}
          onAuto={(isAuto) => props.apply({ isAuto })}
          onPick={pickParallel}
          onNotSure={() => advance(answerNotSureParallel(), null)}
        />
      );
      break;
    case "serial":
      body = (
        <SerialStep
          serialRun={form.serialRun}
          serialNo={form.serialNo}
          knownRun={knownRun}
          onChoose={(choice, move) => {
            const patch = answerSerial(choice, answers);
            if (move) advance(patch);
            else props.apply(patch);
          }}
          onSerialNo={(serialNo) => props.apply({ form: { serialNo } })}
          onNext={() => advance()}
        />
      );
      break;
    case "grade":
      body = (
        <GradeStep
          company={props.gradeCompany}
          number={props.gradeNumber}
          onCompany={(company) => {
            const picked = answerGradeCompany(company);
            const patch = { gradeCompany: picked.gradeCompany };
            if (picked.advance) advance(patch);
            else props.apply(patch);
          }}
          onNumber={(gradeNumber) => advance({ gradeNumber })}
        />
      );
      break;
    case "review":
      body = (
        <ReviewStep
          answers={answers}
          art={art}
          photo={props.photo}
          isAuto={props.isAuto}
          knownRun={knownRun}
          runShown={runShown}
          onJump={jump}
          condition={
            <ConditionRow
              company={props.gradeCompany}
              number={props.gradeNumber}
              certNumber={props.certNumber}
              missingGrade={missingGrade}
              gradesRef={gradesRef}
              onCompany={pickGradeCompany}
              onNumber={(gradeNumber) => {
                setMissingGrade(false);
                props.apply({ gradeNumber });
              }}
              onCertNumber={props.onCertNumber}
            />
          }
          onCondition={() => {
            const chip = sectionRef.current?.querySelector<HTMLElement>('[data-slot="condition"] [data-step-focus]');
            chip?.scrollIntoView?.({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
            chip?.focus({ preventScroll: true });
          }}
          photoBlock={props.photoBlock}
          moreDetails={props.moreDetails}
          moreOpen={props.moreOpen}
          onMoreOpen={props.onMoreOpen}
          sportOffer={props.sportOffer}
          saveError={props.saveError}
          feedPost={props.feedPost}
          formId={props.formId}
          saving={props.saving}
          readingPhoto={props.readingPhoto}
          complete={stepComplete("review", answers)}
          onIncomplete={finishReview}
        />
      );
      break;
  }

  return (
    <div className="space-y-5">
      {props.header}
      {flow.step === "player" ? (
        // Same photo block as before, with the tile beside the buttons on a phone too,
        // so the player search stays above the fold.
        <div className="[&_section>div.grid]:grid-cols-[96px_1fr] [&_section>div.grid]:items-center">
          {props.photoBlock}
        </div>
      ) : null}
      {showStartOver ? (
        <button
          type="button"
          onClick={startOver}
          className="min-h-11 text-sm font-semibold text-violet-700 underline decoration-violet-700/40 underline-offset-2 dark:text-[#A78BFA]"
        >
          {props.prefilled && !props.resumed ? "Start a different card" : "Start over"}
        </button>
      ) : null}

      <section ref={sectionRef} aria-labelledby={headingId} className="scroll-mt-20 space-y-4">
        <div className="flex items-center gap-2">
          {flow.history.length > 0 ? <BackButton onClick={back} /> : null}
          <div className="min-w-0 flex-1">
            <FlowProgress value={flowProgress(flow, answers)} label={`Add card progress: ${counter}`} />
          </div>
          <span className="shrink-0 font-mono text-[11px] text-zinc-500 tabular-nums">
            {counter}
          </span>
        </div>

        {flow.step !== "player" && flow.step !== "review" ? (
          <DraftStrip
            art={art}
            photo={props.photo}
            answers={answers}
            isAuto={props.isAuto}
            runShown={runShown}
            onPlayer={() => jump("player")}
          />
        ) : null}

        {/* Focus goes to the step's field or chip, so the question is read out here. */}
        <p aria-live="polite" className="sr-only">
          {question}
        </p>
        <div key={flow.step} ref={stepRef} className={`space-y-4 ${animation}`}>
          <div>
            <p className="font-mono text-[11px] font-medium text-violet-700 dark:text-[#A78BFA]">
              {STEP_LABELS[flow.step]}
            </p>
            <h2 id={headingId} className="mt-1 text-2xl font-semibold tracking-tight">
              {question}
            </h2>
          </div>
          {body}
        </div>
      </section>
    </div>
  );
}

/** The live preview on every middle step. Fills in as you answer. */
function DraftStrip({
  art,
  photo,
  answers,
  isAuto,
  runShown,
  onPlayer,
}: {
  art: ArtCard;
  photo: string | null;
  answers: FlowAnswers;
  isAuto: boolean;
  runShown: number | null;
  onPlayer: () => void;
}) {
  const line = [
    answers.yearLabel.trim(),
    answers.setBrand.trim(),
    answers.noNumber ? "" : answers.cardNumber.trim() ? `#${answers.cardNumber.trim().toUpperCase()}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      aria-label="Card preview"
      role="group"
      className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-2.5 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <div className="w-14 shrink-0">
        <DraftSlab art={art} photo={photo} />
      </div>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onPlayer}
          aria-label={`Change player, ${answers.playerName}`}
          className={`-mx-1 flex min-h-11 max-w-full items-center rounded-lg px-1 text-left ${focusRing}`}
        >
          <span className="truncate text-base font-semibold tracking-tight">{answers.playerName}</span>
        </button>
        <p className="truncate text-xs text-zinc-500">{line || "Year, set and number next"}</p>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          <SwatchDot name={answers.parallel} size="sm" />
          <span className="truncate">{answers.parallel || "Base"}</span>
          {runShown ? <RunBadge run={runShown} /> : null}
          {isAuto ? (
            <span className="rounded bg-violet-500/15 px-1 font-mono text-[9px] leading-4 font-semibold text-violet-700 dark:text-[#A78BFA]">
              Auto
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function ReviewStep({
  answers,
  art,
  photo,
  isAuto,
  knownRun,
  runShown,
  onJump,
  condition,
  onCondition,
  photoBlock,
  moreDetails,
  moreOpen,
  onMoreOpen,
  sportOffer,
  saveError,
  feedPost,
  formId,
  saving,
  readingPhoto,
  complete,
  onIncomplete,
}: {
  answers: FlowAnswers;
  art: ArtCard;
  photo: string | null;
  isAuto: boolean;
  knownRun: number | null;
  runShown: number | null;
  onJump: (step: AddFlowStep) => void;
  /** Raw or a grader, the grade and the cert number, edited in place. */
  condition: ReactNode;
  /** The summary's grade part: focus the Condition row instead of a Grade screen. */
  onCondition: () => void;
  photoBlock: ReactNode;
  moreDetails: ReactNode;
  moreOpen: boolean;
  onMoreOpen: (open: boolean) => void;
  sportOffer: ReactNode;
  saveError: ReactNode;
  feedPost?: ReactNode;
  formId?: string;
  saving: boolean;
  readingPhoto: boolean;
  complete: boolean;
  onIncomplete: () => void;
}) {
  const parts = reviewParts(answers, { isAuto });
  const numbered = reviewNumberedPart(answers);
  if (numbered) parts.push({ text: " · ", step: null }, numbered);
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center">
        <div className="relative w-32 sm:w-40">
          {/* The reveal after the save glides from here (lib/cards/slab-morph.ts). */}
          <div className="relative" data-slab-morph="source">
            <DraftSlab art={art} photo={photo} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => onJump("player")}
          className={`mt-3 min-h-11 rounded-lg px-2 text-2xl font-semibold tracking-tight ${focusRing}`}
          aria-label={`Change player, ${answers.playerName}`}
        >
          {answers.playerName}
        </button>
        <p className="mt-1 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
          {parts.map((part, index) =>
            part.step ? (
              <button
                key={index}
                type="button"
                onClick={() => (part.step === "grade" ? onCondition() : onJump(part.step!))}
                aria-label={
                  part.hint
                    ? "Numbered? Set a print run"
                    : `Change ${STEP_LABELS[part.step].toLowerCase()}: ${part.text}`
                }
                className={`inline-flex min-h-11 items-center rounded-md px-0.5 underline decoration-dotted underline-offset-4 ${
                  part.hint
                    ? "font-medium text-violet-700 decoration-violet-700/40 hover:decoration-violet-500 dark:text-[#A78BFA] dark:decoration-[#A78BFA]/40"
                    : "font-semibold text-zinc-900 decoration-zinc-300 hover:decoration-violet-500 dark:text-zinc-50 dark:decoration-white/25"
                } ${focusRing}`}
              >
                {part.text}
              </button>
            ) : (
              <span key={index} aria-hidden>
                {part.text}
              </span>
            ),
          )}
        </p>
        {knownRun && runShown === knownRun ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
            Numbered to /{knownRun} (from the checklist)
            <QuietButton onClick={() => onJump("serial")} aria-label="Edit the print run" className="px-2">
              <Pencil className="size-3.5" aria-hidden />
              Edit
            </QuietButton>
          </p>
        ) : null}
      </div>

      {condition}

      <ReviewValue answers={answers} card={{ isAuto, serialRun: runShown }} />

      {photoBlock}
      {feedPost}

      <details
        open={moreOpen}
        onToggle={(event) => onMoreOpen(event.currentTarget.open)}
        className="group rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.03]"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">More details</span>
            <span className="block text-xs text-zinc-500">
              What you paid, notes, rookie and patch
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-zinc-500 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="space-y-5 border-t border-zinc-200 px-4 pt-4 pb-5 dark:border-white/10">
          {moreDetails}
        </div>
      </details>

      {sportOffer}
      {saveError}

      <StepDock done>
        <button
          type="submit"
          form={formId}
          disabled={saving || readingPhoto}
          // Looks unavailable until complete but stays tappable: a tap shows what's missing.
          aria-disabled={complete ? undefined : true}
          onMouseDown={(event) => {
            // Keep focus so onBlur validation cannot swallow the first click.
            if (event.button === 0) event.preventDefault();
          }}
          onClick={(event) => {
            if (complete) return;
            event.preventDefault();
            onIncomplete();
          }}
          className={`min-h-12 w-full rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:opacity-50 ${focusRing}`}
        >
          {saving ? "Adding…" : "Add to collection"}
        </button>
      </StepDock>
    </div>
  );
}
