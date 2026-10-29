"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Camera, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { CardSlabArt } from "@/components/card-slab-art";
import {
  NameSearch,
  SportChips,
  nameAlreadyPicked,
  toggleName,
  toggleSport,
  useCollectSports,
  withoutName,
} from "@/components/collect-editor";
import { useCollection } from "@/components/collection-provider";
import { FollowButton } from "@/components/follow-button";
import { InstallGuide, useInstallPlatform, type GuidePlatform } from "@/components/onboarding/install-step";
import { useSocial } from "@/components/social-provider";
import {
  SETUP_STEPS,
  setupProgress,
  setupStepAfter,
  setupSuggestions,
  setupVisible,
  type SetupState,
  type SetupStep,
} from "@/lib/onboarding/first-run";
import {
  completeSetup,
  readInstallChoice,
  readSetupState,
  setSetupActive,
  writeInstallChoice,
  writeSetupState,
} from "@/lib/onboarding/store";
import { installStepShows, type InstallChoice } from "@/lib/pwa/install-step";
import {
  canAddPick,
  interestWriteRows,
  interestsAnswered,
  persistInterestRows,
  PICK_LIMIT,
  PICK_LIMIT_MESSAGE,
  schemaMissing,
  trapTabTarget,
  type InterestHit,
  type InterestLoad,
  type InterestRow,
} from "@/lib/social/collect-interests";
import type { CollectInterest } from "@/lib/social/follow-rank";
import { isRecentAccount } from "@/lib/social/get-started";
import { loadServerSuggestions, SETUP_SUGGESTION_LIMIT } from "@/lib/social/load-suggestions";
import type { ServerSuggestion } from "@/lib/social/suggestion-order";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const STEP_IN = "motion-safe:animate-[add-step-in_220ms_cubic-bezier(0.2,0.7,0.2,1)_both]";
const STEP_BACK = "motion-safe:animate-[add-step-back_220ms_cubic-bezier(0.2,0.7,0.2,1)_both]";

const primaryButton =
  "flex h-14 w-full items-center justify-center gap-2 rounded-full bg-violet-600 text-[17px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(124,58,237,0.8)] active:scale-[0.98] disabled:opacity-50 motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] focus-visible:outline-none";
const quietButton =
  "flex min-h-11 w-full items-center justify-center rounded-full text-[15px] font-semibold text-zinc-500 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none";

const SAMPLE_FIRST_CARD = {
  playerName: "Your first card",
  year: 0,
  yearLabel: "",
  setBrand: "",
  grade: "10",
  gradeQualifier: "",
  certNumber: "",
  accent: "#7C3AED",
  conditionType: "graded" as const,
  grader: "PSA",
};

function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

async function readInterests(userId: string): Promise<InterestLoad> {
  const supabase = createSupabaseBrowser();
  if (!supabase) return { status: "missing" };
  const { data, error } = await supabase
    .from("profile_interests")
    .select("kind, value")
    .eq("user_id", userId);
  if (error) {
    if (!schemaMissing(error)) console.warn("profile_interests", error.message);
    return { status: "missing" };
  }
  return {
    status: "ready",
    rows: ((data ?? []) as { kind?: string; value?: string }[])
      .filter((row) => row.kind && row.value)
      .map((row) => ({ kind: row.kind, value: row.value }) as InterestRow),
  };
}

async function writeInterests(
  userId: string,
  rows: InterestRow[],
): Promise<"saved" | "missing" | "limit" | "error"> {
  const supabase = createSupabaseBrowser();
  if (!supabase) return "missing";
  return persistInterestRows(supabase, userId, rows);
}

/**
 * First-run setup: Add to Home Screen (phones only), then what you collect, a
 * few collectors to follow, and your first card. Every step can be skipped.
 * Replaces the old collecting prompt, and Home's older prompts wait while it
 * is open.
 */
export function FirstRunSetup() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { user, mode, suggestions, refreshSuggestions, followMany, isFollowing, followingCount } = useSocial();
  const { cards, ready: cardsReady } = useCollection();
  const userId = user?.id ?? null;
  const [load, setLoad] = useState<InterestLoad>({ status: "loading" });
  const [stored, setStored] = useState<{ userId: string | null; value: SetupState | null }>({
    userId: null,
    value: null,
  });
  const [installChoice, setInstallChoice] = useState<{ userId: string | null; value: InstallChoice | null }>({
    userId: null,
    value: null,
  });
  const [step, setStep] = useState<SetupStep>("collect");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [sports, setSports] = useState<string[]>([]);
  const [names, setNames] = useState<CollectInterest[]>([]);
  const [catalogSports, setCatalogSports] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<ServerSuggestion[] | null>(null);
  const [limitNote, setLimitNote] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<() => void>(() => {});
  const titleId = useId();
  const sportOptions = useCollectSports(catalogSports);
  const platform = useInstallPlatform();

  if (stored.userId !== userId) {
    const value = userId && typeof window !== "undefined" ? readSetupState(userId) : null;
    setStored({ userId, value });
    if (value && value !== "done") setStep(value);
  }
  if (installChoice.userId !== userId) {
    const value = userId && typeof window !== "undefined" ? readInstallChoice(userId) : null;
    setInstallChoice({ userId, value });
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void readInterests(userId).then((next) => {
      if (!cancelled) setLoad(next);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Local mode seeds the same demo cards for every account, so only
  // follows and account age say "new" there.
  const localNewUser =
    mode === "local" &&
    Boolean(user) &&
    followingCount(userId ?? "") === 0 &&
    isRecentAccount(user?.createdAt ?? "");
  const hasOwnCards = mode === "supabase" && cardsReady && cards.length > 0;

  const visible =
    stored.userId === userId &&
    setupVisible({
      signedIn: Boolean(user),
      stored: stored.value,
      table: load.status,
      answered: load.status === "ready" ? interestsAnswered(load.rows) : false,
      pathname,
      localNewUser,
    });

  // Add to Home Screen comes first, once, before setup's own steps.
  const installFirst =
    visible &&
    installChoice.userId === userId &&
    installStepShows({ platform, choice: installChoice.value, setupStored: stored.value });
  const setupShown = visible && !installFirst;

  useEffect(() => {
    setSetupActive(visible);
  }, [visible]);

  useEffect(() => () => setSetupActive(false), []);

  useEffect(() => {
    if (!visible) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    void supabase
      .from("card_catalog")
      .select("sport")
      .limit(400)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setCatalogSports(
          (data as { sport?: string | null }[])
            .map((row) => row.sport ?? "")
            .filter(Boolean),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    closeRef.current = () => {
      if (!busy) void go("skip");
    };
  });

  useEffect(() => {
    if (!setupShown) return;
    const root = dialogRef.current;
    if (!root) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const docEl = document.documentElement;
    const overflow = docEl.style.overflow;
    docEl.style.overflow = "hidden";
    const items = () => focusable(root);
    root.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const list = items();
      const active = list.indexOf(document.activeElement as HTMLElement);
      const next = trapTabTarget(list.length, active, event.shiftKey);
      if (next == null) return;
      event.preventDefault();
      list[next]?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      docEl.style.overflow = overflow;
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [setupShown]);

  if (!visible || !user) return null;
  const me = user;

  if (installFirst) {
    return (
      <InstallGuide
        platform={platform as GuidePlatform}
        variant="onboarding"
        email={me.email}
        onDone={(choice) => {
          writeInstallChoice(me.id, choice);
          setInstallChoice({ userId: me.id, value: choice });
        }}
      />
    );
  }

  const pickCount = sports.length + names.length;
  const limitMessage = limitNote ?? (pickCount >= PICK_LIMIT ? PICK_LIMIT_MESSAGE : null);

  function remember(value: SetupState) {
    writeSetupState(me.id, value);
    setStored({ userId: me.id, value });
  }

  function addSport(sport: string) {
    const removing = sports.some((item) => item.toLowerCase() === sport.toLowerCase());
    if (!removing && !canAddPick(pickCount)) {
      setLimitNote(PICK_LIMIT_MESSAGE);
      return;
    }
    setLimitNote(null);
    setSports((current) => toggleSport(current, sport));
  }

  function addName(hit: InterestHit) {
    const exists = nameAlreadyPicked(names, hit);
    if (!exists && !canAddPick(pickCount)) {
      setLimitNote(PICK_LIMIT_MESSAGE);
      return;
    }
    setLimitNote(null);
    setNames((current) => toggleName(current, hit));
  }

  /** Saves the collect step. Skip records "skipped" so we don't ask again. */
  async function saveInterests(action: "skip" | "complete"): Promise<boolean> {
    if (load.status !== "ready") return true;
    setBusy(true);
    const picks = [...sports.map((value) => ({ kind: "sport" as const, value })), ...names];
    const rows = action === "skip" ? interestWriteRows("skip", picks) : interestWriteRows("complete", picks);
    const result = await writeInterests(me.id, rows);
    if (result === "limit") {
      setBusy(false);
      setLimitNote(PICK_LIMIT_MESSAGE);
      return false;
    }
    if (result === "saved") {
      refreshSuggestions();
      if (action === "complete") {
        const supabase = createSupabaseBrowser();
        const ranked = supabase ? await loadServerSuggestions(supabase) : null;
        if (ranked) setPeople(ranked);
      }
    }
    setBusy(false);
    return true;
  }

  function finish(addCard: boolean) {
    remember("done");
    setSetupActive(false);
    completeSetup();
    router.push(addCard ? "/cards/new" : "/");
  }

  async function go(action: "next" | "skip" | "back") {
    if (step === "collect" && action !== "back") {
      const ok = await saveInterests(action === "skip" ? "skip" : "complete");
      if (!ok) return;
    }
    let target = setupStepAfter(step, action);
    // Collectors who already have cards don't need the first-card step.
    if (target === "card" && hasOwnCards) target = "done";
    if (target === "done") {
      finish(false);
      return;
    }
    remember(target);
    setDirection(action === "back" ? -1 : 1);
    setStep(target);
  }

  const shownPeople = setupSuggestions(
    people ??
      suggestions.map((profile) => ({
        userId: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarDataUrl,
        accent: profile.accent,
        reason: profile.suggestionReason ?? null,
        score: 0,
      })),
    me.id,
  ).slice(0, SETUP_SUGGESTION_LIMIT);
  const unfollowed = shownPeople.filter((profile) => !isFollowing(profile.userId));
  const stepNumber = SETUP_STEPS.indexOf(step) + 1;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-first-run
      className="fixed inset-0 z-50 flex flex-col bg-[var(--background)] text-[var(--foreground)] outline-none"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.18),_transparent_55%)]" />
      <header className="relative mx-auto w-full max-w-lg px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          <div className="justify-self-start">
            {step !== "collect" ? (
              <button
                type="button"
                onClick={() => void go("back")}
                aria-label="Back"
                disabled={busy}
                className="-ml-1 grid h-11 w-11 place-items-center rounded-full hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none dark:hover:bg-white/10"
              >
                <ArrowLeft aria-hidden className="h-6 w-6" />
              </button>
            ) : (
              <span aria-hidden className="block h-11 w-11" />
            )}
          </div>
          <span className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
            {stepNumber} of {SETUP_STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => void go("skip")}
            disabled={busy}
            className="min-h-11 justify-self-end rounded-full px-3 text-[15px] font-semibold text-zinc-500 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none dark:hover:text-white"
          >
            Skip
          </button>
        </div>
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={1}
          aria-valuemax={SETUP_STEPS.length}
          aria-valuenow={stepNumber}
          aria-valuetext={`Step ${stepNumber} of ${SETUP_STEPS.length}`}
          className="mt-1 h-1 w-full rounded-full bg-zinc-200 dark:bg-white/10"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#5B21B6] to-[#7C3AED] transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${setupProgress(step) * 100}%` }}
          />
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div key={step} className={`mx-auto w-full max-w-lg px-5 pt-7 pb-6 ${direction === 1 ? STEP_IN : STEP_BACK}`}>
          {step === "collect" ? (
            <>
              <h2 id={titleId} className="text-[28px] leading-tight font-extrabold tracking-tight">
                What do you collect?
              </h2>
              <p className="mt-2 text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">
                Pick a sport or two. We&apos;ll use it to find your people.
              </p>
              <div className="mt-6">
                <SportChips big sports={sportOptions} selected={sports} onToggle={addSport} />
              </div>
              {load.status === "ready" ? (
                <div className="mt-8">
                  <h3 className="text-[15px] font-bold">Favorite players or teams</h3>
                  <p className="mt-0.5 text-sm text-zinc-500">Optional. One is plenty.</p>
                  <div className="mt-3">
                    <NameSearch
                      sports={sports}
                      selected={names}
                      onAdd={addName}
                      onRemove={(hit) => {
                        setLimitNote(null);
                        setNames((current) => withoutName(current, hit));
                      }}
                    />
                  </div>
                </div>
              ) : null}
              {limitMessage ? <p className="mt-3 text-sm text-zinc-500">{limitMessage}</p> : null}
            </>
          ) : null}

          {step === "people" ? (
            <>
              <h2 id={titleId} className="text-[28px] leading-tight font-extrabold tracking-tight">
                Follow a few collectors
              </h2>
              <p className="mt-2 text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">
                Their pickups, posts and cards fill your Home feed.
              </p>
              {shownPeople.length > 0 ? (
                <>
                  <div className="mt-5 flex items-center justify-between">
                    <p className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
                      Suggested for you
                    </p>
                    <button
                      type="button"
                      disabled={unfollowed.length === 0}
                      onClick={() => void followMany(unfollowed.map((profile) => profile.userId))}
                      className="inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-semibold text-violet-700 hover:bg-violet-600/10 disabled:text-zinc-400 dark:text-[#A78BFA]"
                    >
                      {unfollowed.length === 0 ? "Following all" : "Follow all"}
                    </button>
                  </div>
                  <ul className="mt-1 divide-y divide-zinc-200 dark:divide-white/10">
                    {shownPeople.map((profile) => (
                      <li key={profile.userId} className="flex min-h-16 items-center gap-3 py-3">
                        <Avatar
                          name={profile.displayName}
                          image={profile.avatarUrl}
                          accent={profile.accent || "#7c5cff"}
                          expandable={false}
                          className="h-12 w-12 text-sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-bold">{profile.displayName}</p>
                          <p className="truncate text-sm text-zinc-500">
                            {profile.reason || `@${profile.username}`}
                          </p>
                        </div>
                        <FollowButton userId={profile.userId} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="mt-8 rounded-3xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-white/15">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-violet-600/10 text-violet-600 dark:text-[#A78BFA]">
                    <Users aria-hidden className="h-6 w-6" />
                  </span>
                  <p className="mt-3 text-[17px] font-bold tracking-tight">No suggestions yet</p>
                  <p className="mx-auto mt-1 max-w-xs text-sm leading-5 text-zinc-500">
                    We&apos;ll suggest collectors as they post. You can search for people any time.
                  </p>
                </div>
              )}
            </>
          ) : null}

          {step === "card" ? (
            <>
              <h2 id={titleId} className="text-[28px] leading-tight font-extrabold tracking-tight">
                Add your first card
              </h2>
              <p className="mt-2 text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">
                Snap a slab or a raw card. We match it to recent sold prices.
              </p>
              <div aria-hidden className="relative mx-auto mt-10 w-[42%] max-w-[170px]">
                <div className="absolute inset-[-12%] rounded-full bg-[#7C3AED] opacity-40 blur-[48px]" />
                <div className="relative drop-shadow-[0_18px_40px_rgba(124,58,237,0.45)]">
                  <CardSlabArt
                    card={SAMPLE_FIRST_CARD}
                    index={0}
                    source={{ kind: "none" }}
                    status="loading"
                    onStatus={() => {}}
                    sizes="170px"
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <footer className="relative mx-auto w-full max-w-lg space-y-1 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {step === "card" ? (
          <>
            <button type="button" onClick={() => finish(true)} className={primaryButton}>
              <Camera aria-hidden className="h-5 w-5" />
              Add a card
            </button>
            <button type="button" onClick={() => finish(false)} className={quietButton}>
              I&apos;ll do it later
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => void go("next")} className={primaryButton}>
            {busy ? "Saving…" : "Continue"}
          </button>
        )}
      </footer>
    </div>
  );
}
