"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import {
  BackButton,
  DraftSlab,
  FlowProgress,
  QuietButton,
  RunBadge,
  SwatchDot,
  focusRing,
} from "@/components/add-card/flow-ui";
import { GradeStep, NumberStep, ParallelStep, SerialStep } from "@/components/add-card/detail-steps";
import { PlayerStep, type PlayerPick } from "@/components/add-card/player-step";
import { SetStep } from "@/components/add-card/set-step";
import { useProductData } from "@/lib/cards/use-product-data";
import { rememberPlayer, useRecentPlayers } from "@/components/add-card/use-recent-players";
import { YearStep } from "@/components/add-card/year-step";
import { useCollection } from "@/components/collection-provider";
import type { ArtCard } from "@/components/card-slab-art";
import { searchCatalog, type CatalogCard } from "@/lib/card-catalog";
import { parseYearLabel } from "@/lib/card-options";
import {
  ADD_FLOW_STEPS,
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
  flowProgress,
  flowStateAt,
  jumpToStep,
  nextStep,
  openingStep,
  parallelOptions,
  readFlowPosition,
  resumeStep,
  reviewParts,
  setChoices,
  stepComplete,
  stepSkipped,
  writeFlowPosition,
  clearFlowPosition,
  type AddFlowStep,
  type FlowAnswers,
  type FlowPatch,
  type FlowState,
  type ParallelOption,
} from "@/lib/cards/add-flow";
import { collectionPlayers } from "@/lib/cards/add-flow-players";
import { applyGradingCompany } from "@/lib/cards/grading-company";
import type { CardDraftForm } from "@/lib/cards/new-card-draft";
import { parallelIn, parallelsIn, sameSeason, serialRunIn, setNamesIn } from "@/lib/cards/product-data";
import { searchCatalogRemote } from "@/lib/catalog/search-remote";

export type AddCardFlowProps = {
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
  /** Keys the remembered step to this draft and user. */
  positionKey: string | null;
  apply: (patch: FlowPatch) => void;
  pickCatalog: (card: CatalogCard) => void;
  onStartOver: () => void;
  header: ReactNode;
  photoBlock: ReactNode;
  moreDetails: ReactNode;
  moreOpen: boolean;
  onMoreOpen: (open: boolean) => void;
  sportOffer: ReactNode;
  saveError: ReactNode;
};

const STEP_IN = "motion-safe:animate-[add-step-in_220ms_cubic-bezier(0.2,0.7,0.2,1)_both]";
const STEP_BACK = "motion-safe:animate-[add-step-back_220ms_cubic-bezier(0.2,0.7,0.2,1)_both]";
/** Reduced motion: no slide, just a short fade. */
const STEP_FADE = "motion-reduce:animate-[add-fade_150ms_linear_both]";

/**
 * Add card as a guided picker: Player → Year → Set → Card # → Parallel →
 * Numbered? → Grade → Review. CardForm keeps the state, the draft and the save;
 * this only asks one question at a time and writes the answers back.
 */
export function AddCardFlow(props: AddCardFlowProps) {
  const { form } = props;
  const { cards } = useCollection();
  const recent = useRecentPlayers();
  const products = useProductData(form.playerName.trim() !== "");
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const firstPaint = useRef(true);

  const knownRow = products.data
    ? parallelIn(products.data, form.sport, form.yearLabel, form.setBrand, form.parallel)
    : null;
  const knownRun = knownRow?.serialRun && knownRow.serialRun >= 1 ? knownRow.serialRun : null;

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
  };

  const [flow, setFlow] = useState<FlowState>(() => {
    if (props.resumed) {
      return readFlowPosition(props.positionKey) ?? flowStateAt(resumeStep(answers), answers);
    }
    return flowStateAt(openingStep(answers), answers);
  });
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [showStartOver, setShowStartOver] = useState(props.resumed);

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

  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false;
      return;
    }
    const section = sectionRef.current;
    if (section && section.getBoundingClientRect().top < 0) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      section.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
    }
    // The player step focuses its search field; every other step announces its question.
    if (flow.step !== "player") headingRef.current?.focus({ preventScroll: true });
  }, [flow.step]);

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
      }),
    [catalogRows, form.sport, form.yearLabel, products.data],
  );

  const parallelList = useMemo(() => {
    const checklist = products.data
      ? parallelsIn(products.data, form.sport, form.yearLabel, form.setBrand)
      : null;
    return parallelOptions(checklist, form.setBrand, form.parallel);
  }, [products.data, form.sport, form.yearLabel, form.setBrand, form.parallel]);

  function go(next: FlowState, dir: "forward" | "back") {
    setDirection(dir);
    setFlow(next);
    writeFlowPosition(props.positionKey, next);
  }

  function advance(patch?: FlowPatch, run: number | null = knownRun) {
    if (patch) props.apply(patch);
    const nextAnswers = patch ? answersWithPatch(answers, patch, run) : answers;
    go(nextStep(flow, nextAnswers), "forward");
  }

  function back() {
    go(backStep(flow), "back");
  }

  function jump(step: AddFlowStep) {
    go(jumpToStep(flow, step), "back");
  }

  function startOver() {
    props.onStartOver();
    clearFlowPosition();
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
    go(jumped.state, "forward");
  }

  function pickSet(name: string) {
    const patch = answerSet(name, answers, props.parallelIsCustom);
    const run = products.data
      ? serialRunIn(products.data, form.sport, form.yearLabel, name, patch.form.parallel ?? form.parallel)
      : null;
    advance(patch, run);
  }

  function pickParallel(option: ParallelOption) {
    const run = products.data
      ? serialRunIn(products.data, form.sport, form.yearLabel, form.setBrand, option.name)
      : option.runVaries
        ? null
        : option.serialRun;
    advance(answerParallel(form.setBrand, option.name, run, answers), run);
  }

  const visible = ADD_FLOW_STEPS.filter((step) => step !== "review" && !stepSkipped(step, answers));
  const stepNumber = visible.indexOf(flow.step) + 1;
  const counter = flow.step === "review" ? "Review" : `Step ${Math.max(stepNumber, 1)} of ${visible.length}`;
  const animation = `${direction === "back" ? STEP_BACK : STEP_IN} ${STEP_FADE}`;
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
      body = (
        <PlayerStep
          initial={form.playerName}
          recent={recent}
          owned={owned}
          onPick={pickPlayer}
        />
      );
      break;
    case "year":
      body = (
        <YearStep
          sport={form.sport}
          value={form.yearLabel}
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
          options={parallelList}
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
          photoBlock={props.photoBlock}
          moreDetails={props.moreDetails}
          moreOpen={props.moreOpen}
          onMoreOpen={props.onMoreOpen}
          sportOffer={props.sportOffer}
          saveError={props.saveError}
          saving={props.saving}
          readingPhoto={props.readingPhoto}
          onIncomplete={() => go(flowStateAt(resumeStep(answers), answers), "back")}
        />
      );
      break;
  }

  return (
    <div className="space-y-5">
      {props.header}
      {flow.step === "player" ? props.photoBlock : null}
      {showStartOver ? (
        <button
          type="button"
          onClick={startOver}
          className="min-h-11 text-sm font-semibold text-violet-700 underline decoration-violet-700/40 underline-offset-2 dark:text-[#A78BFA]"
        >
          Start over
        </button>
      ) : null}

      <section ref={sectionRef} aria-labelledby={headingId} className="scroll-mt-20 space-y-4">
        <div className="flex items-center gap-2">
          {flow.history.length > 0 ? <BackButton onClick={back} /> : null}
          <div className="min-w-0 flex-1">
            <FlowProgress value={flowProgress(flow, answers)} label={`Add card progress: ${counter}`} />
          </div>
          <span className="shrink-0 font-mono text-[11px] tracking-wider text-zinc-500 uppercase tabular-nums">
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

        <div key={flow.step} className={`space-y-4 ${animation}`}>
          <div>
            <p className="font-mono text-[11px] font-medium tracking-wider text-violet-700 uppercase dark:text-[#A78BFA]">
              {STEP_LABELS[flow.step]}
            </p>
            <h2
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="mt-1 text-2xl font-extrabold tracking-tight outline-none"
            >
              {STEP_QUESTIONS[flow.step]}
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
          <span className="truncate text-base font-bold tracking-tight">{answers.playerName}</span>
        </button>
        <p className="truncate text-xs text-zinc-500">{line || "Year, set and number next"}</p>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          <SwatchDot name={answers.parallel} size="sm" />
          <span className="truncate">{answers.parallel || "Base"}</span>
          {runShown ? <RunBadge run={runShown} /> : null}
          {isAuto ? (
            <span className="rounded bg-violet-500/15 px-1 font-mono text-[9px] leading-4 font-semibold tracking-wider text-violet-700 uppercase dark:text-[#A78BFA]">
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
  photoBlock,
  moreDetails,
  moreOpen,
  onMoreOpen,
  sportOffer,
  saveError,
  saving,
  readingPhoto,
  onIncomplete,
}: {
  answers: FlowAnswers;
  art: ArtCard;
  photo: string | null;
  isAuto: boolean;
  knownRun: number | null;
  runShown: number | null;
  onJump: (step: AddFlowStep) => void;
  photoBlock: ReactNode;
  moreDetails: ReactNode;
  moreOpen: boolean;
  onMoreOpen: (open: boolean) => void;
  sportOffer: ReactNode;
  saveError: ReactNode;
  saving: boolean;
  readingPhoto: boolean;
  onIncomplete: () => void;
}) {
  const parts = reviewParts(answers, { isAuto });
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center">
        <div className="relative w-40">
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-6 rounded-full bg-violet-600/25 blur-2xl"
          />
          <div className="relative">
            <DraftSlab art={art} photo={photo} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => onJump("player")}
          className={`mt-4 min-h-11 rounded-lg px-2 text-2xl font-extrabold tracking-tight ${focusRing}`}
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
                onClick={() => onJump(part.step!)}
                aria-label={`Change ${STEP_LABELS[part.step].toLowerCase()}: ${part.text}`}
                className={`inline-flex min-h-11 items-center rounded-md px-0.5 font-semibold text-zinc-900 underline decoration-zinc-300 decoration-dotted underline-offset-4 hover:decoration-violet-500 dark:text-zinc-50 dark:decoration-white/25 ${focusRing}`}
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

      {photoBlock}

      <details
        open={moreOpen}
        onToggle={(event) => onMoreOpen(event.currentTarget.open)}
        className="group rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.03]"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">More details</span>
            <span className="block text-xs text-zinc-500">
              What you paid, notes, sharing, rookie and patch
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

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 -mx-4 bg-[color-mix(in_oklab,var(--background)_96%,transparent)] px-4 py-3 backdrop-blur-xl sm:mx-0 sm:px-0">
        <button
          type="submit"
          disabled={saving || readingPhoto}
          onMouseDown={(event) => {
            // Keep focus so onBlur validation cannot swallow the first click.
            if (event.button === 0) event.preventDefault();
          }}
          onClick={(event) => {
            if (stepComplete("review", answers)) return;
            event.preventDefault();
            onIncomplete();
          }}
          className={`min-h-12 w-full rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
        >
          {saving ? "Adding…" : "Add to collection"}
        </button>
      </div>
    </div>
  );
}
