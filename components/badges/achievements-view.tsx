"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { Badge, badgeLabel } from "@/components/badges/badge";
import {
  BADGE_THRESHOLDS,
  BADGE_TIERS,
  CATEGORY_COPY,
  MAX_PINNED_BADGES,
  TIER_LABELS,
  type BadgeCategory,
  type BadgeTier,
  type ProgressCategory,
} from "@/lib/badges/config";
import { formatPin, profilePins, togglePin } from "@/lib/badges/pins";
import type { CategoryStatus, EarnedBadge } from "@/lib/badges/progress";
import { savePinnedBadges, saveShowBadges } from "@/lib/badges/save";

export type AchievementsState = {
  eligible: boolean;
  statuses: CategoryStatus[];
  earned: (EarnedBadge & { earnedAt: string })[];
  showBadges: boolean;
  pinned: string[];
  earnedCount: number;
  total: number;
};

const panel =
  "rounded-3xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.03]";

function earnedDate(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "Earned";
  const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(time));
  return `Earned ${label}`;
}

export function AchievementsView({ state }: { state: AchievementsState | null }) {
  if (!state) return <BadgesUnavailable />;
  return <Achievements state={state} />;
}

function Achievements({ state }: { state: AchievementsState }) {
  const [pins, setPins] = useState<string[]>(state.pinned);
  const [show, setShow] = useState(state.showBadges);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<ProgressCategory | null>(null);
  const shown = profilePins(pins, state.earned);
  const auto = !state.earned.some((badge) => pins.includes(formatPin(badge)));
  const openStatus = state.statuses.find((status) => status.category === open) ?? null;

  const effective = shown.map(formatPin);

  async function onTogglePin(badge: EarnedBadge) {
    // Auto pins become explicit once the owner changes anything.
    const result = togglePin(effective, badge);
    if (result.full) {
      setNote(`You can pin ${MAX_PINNED_BADGES}. Unpin one first.`);
      return;
    }
    const previous = pins;
    setPins(result.pins);
    setNote(null);
    const saved = await savePinnedBadges(result.pins);
    if (!saved.ok) {
      setPins(previous);
      setNote(saved.error);
    }
  }

  async function onToggleShow() {
    const next = !show;
    setShow(next);
    setNote(null);
    const saved = await saveShowBadges(next);
    if (!saved.ok) {
      setShow(!next);
      setNote(saved.error);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Achievements</h1>
      <p className="mt-1 text-sm text-zinc-500">
        <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
          {state.earnedCount} / {state.total}
        </span>{" "}
        badges earned
      </p>
      {!state.eligible ? (
        <p className="mt-3 rounded-2xl bg-zinc-100 px-3 py-2 text-xs leading-5 text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
          Test and official accounts don&apos;t earn badges.
        </p>
      ) : null}

      <section
        aria-labelledby="pinned-heading"
        className="relative mt-5 overflow-hidden rounded-3xl border border-violet-500/20 bg-[#09090B] p-4 text-zinc-100"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.32),_transparent_65%)]"
        />
        <div className="relative">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="pinned-heading"
              className="font-mono text-[11px] font-medium tracking-[0.14em] text-[#A78BFA] uppercase"
            >
              Pinned on your profile
            </h2>
            {shown.length > 0 && auto ? (
              <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] tracking-wider text-zinc-300 uppercase">
                Auto
              </span>
            ) : null}
          </div>
          {shown.length > 0 ? (
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {shown.map((badge) => (
                <li key={formatPin(badge)} className="flex min-w-0 flex-col items-center text-center">
                  <Badge category={badge.category} tier={badge.tier} size={72} label="" />
                  <p className="mt-1.5 w-full truncate text-[13px] font-semibold">
                    {CATEGORY_COPY[badge.category].label}
                  </p>
                  <p
                    className={`text-xs ${badge.tier === "legendary" ? "text-[#A78BFA]" : "text-zinc-400"}`}
                  >
                    {TIER_LABELS[badge.tier]}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <Badge category="collector" tier="bronze" size={56} locked progress={0} label="" />
              <p className="text-sm leading-5 text-zinc-300">
                Your first badges land here. Add 10 cards with a real photo to earn Bronze Collector.
              </p>
            </div>
          )}
          {shown.length > 0 ? (
            <p className="mt-3 text-xs leading-5 text-zinc-400">
              {auto
                ? "Showing your top 3. Tap a category below to pin your own."
                : `Pinned ${pins.length} of ${MAX_PINNED_BADGES}. Tap a category below to change.`}
            </p>
          ) : null}
          <div className="mt-4 flex min-h-11 items-center justify-between gap-3 border-t border-white/10 pt-3">
            <div className="min-w-0">
              <p id="show-badges-label" className="text-sm font-semibold">
                Show badges on my profile
              </p>
              <p className="text-xs text-zinc-400">
                {show ? "Anyone can see your pinned and earned badges." : "Only you can see your badges."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={show}
              aria-labelledby="show-badges-label"
              onClick={() => void onToggleShow()}
              className="relative grid h-11 w-14 shrink-0 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:outline-none"
            >
              <span
                className={`h-7 w-12 rounded-full transition-colors duration-200 motion-reduce:transition-none ${show ? "bg-violet-600" : "bg-zinc-700"}`}
              />
              <span
                className={`absolute top-1/2 left-1 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${show ? "translate-x-[1.375rem]" : "translate-x-0.5"}`}
              />
            </button>
          </div>
        </div>
      </section>

      {note ? (
        <p role="status" className="mt-3 text-center text-sm text-zinc-500">
          {note}
        </p>
      ) : null}

      <section aria-label="Badge categories" className={`mt-4 ${panel}`}>
        <ul className="divide-y divide-zinc-200 dark:divide-white/10">
          {state.statuses.map((status) => (
            <li key={status.category}>
              <CategoryRow status={status} onOpen={() => setOpen(status.category)} />
            </li>
          ))}
          <li>
            <LimitedRow />
          </li>
        </ul>
      </section>

      <p className="mt-4 px-2 text-center text-xs leading-5 text-zinc-500">
        Badges are permanent once earned. Counts use real photos and real collectors, like the{" "}
        <Link href="/leaderboard" className="underline underline-offset-2">
          leaderboard
        </Link>
        .
      </p>

      {openStatus ? (
        <TierSheet
          status={openStatus}
          earned={state.earned}
          pins={effective}
          note={note}
          onTogglePin={(badge) => void onTogglePin(badge)}
          onClose={() => {
            setOpen(null);
            setNote(null);
          }}
        />
      ) : null}
    </div>
  );
}

function CategoryRow({ status, onOpen }: { status: CategoryStatus; onOpen: () => void }) {
  const copy = CATEGORY_COPY[status.category];
  const current = status.earned;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${copy.label}. ${current ? `${TIER_LABELS[current]} earned. ` : ""}${status.line}`}
      className="flex min-h-[4.5rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none dark:hover:bg-white/[0.03] dark:focus-visible:bg-white/[0.05]"
    >
      {current ? (
        <Badge category={status.category} tier={current} size={52} animate={false} label="" />
      ) : (
        <Badge category={status.category} tier="bronze" size={52} locked label="" className="opacity-60" />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-[15px] font-semibold">{copy.label}</span>
          {current ? (
            <span className="shrink-0 text-xs text-zinc-500">{TIER_LABELS[current]}</span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[13px] text-zinc-500 tabular-nums">{status.line}</span>
      </span>
      {status.next ? (
        <Badge
          category={status.category}
          tier={status.next}
          size={40}
          locked
          progress={status.progress}
          label=""
        />
      ) : null}
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-zinc-400" />
    </button>
  );
}

function LimitedRow() {
  return (
    <div className="flex min-h-[4.5rem] items-center gap-3 px-4 py-3">
      <Badge category="limited" tier="bronze" size={52} locked label="" className="opacity-60" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{CATEGORY_COPY.limited.label}</p>
        <p className="mt-0.5 text-[13px] text-zinc-500">{CATEGORY_COPY.limited.rule}</p>
      </div>
      <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 font-mono text-[10px] tracking-wider text-zinc-500 uppercase dark:bg-white/10 dark:text-zinc-400">
        Coming soon
      </span>
    </div>
  );
}

function TierSheet({
  status,
  earned,
  pins,
  note,
  onTogglePin,
  onClose,
}: {
  status: CategoryStatus;
  earned: (EarnedBadge & { earnedAt: string })[];
  pins: readonly string[];
  note: string | null;
  onTogglePin: (badge: EarnedBadge) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const copy = CATEGORY_COPY[status.category];

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button") ?? [])].filter(
        (element) => !element.hasAttribute("disabled"),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 sm:place-items-center" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--background)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold tracking-tight">
              {copy.label}
            </h2>
            <p className="text-sm text-zinc-500">{copy.rule}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ol className="mt-3 divide-y divide-zinc-200 dark:divide-white/10">
          {BADGE_TIERS.map((tier, index) => (
            <TierRow
              key={tier}
              category={status.category}
              tier={tier}
              target={BADGE_THRESHOLDS[status.category][index]}
              value={status.value}
              earned={earned.find((badge) => badge.category === status.category && badge.tier === tier) ?? null}
              pinned={pins.includes(`${status.category}:${tier}`)}
              onTogglePin={onTogglePin}
            />
          ))}
        </ol>
        {note ? (
          <p role="status" className="mt-2 text-center text-sm text-zinc-500">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TierRow({
  category,
  tier,
  target,
  value,
  earned,
  pinned,
  onTogglePin,
}: {
  category: BadgeCategory;
  tier: BadgeTier;
  target: number;
  value: number;
  earned: { earnedAt: string } | null;
  pinned: boolean;
  onTogglePin: (badge: EarnedBadge) => void;
}) {
  const copy = CATEGORY_COPY[category];
  const unit = target === 1 ? copy.unitOne : copy.unit;
  return (
    <li className="flex min-h-16 items-center gap-3 py-2.5">
      <Badge
        category={category}
        tier={tier}
        size={48}
        locked={!earned}
        progress={earned ? null : Math.min(1, value / target)}
        label={badgeLabel(category, tier, !earned)}
      />
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] font-semibold ${tier === "legendary" ? "text-violet-700 dark:text-[#A78BFA]" : ""}`}>
          {TIER_LABELS[tier]}
        </p>
        <p className="text-[13px] text-zinc-500 tabular-nums">
          {earned ? `${target} ${unit} · ${earnedDate(earned.earnedAt)}` : `${Math.min(value, target)} / ${target} ${unit}`}
        </p>
      </div>
      {earned ? (
        <button
          type="button"
          aria-pressed={pinned}
          aria-label={`${pinned ? "Unpin" : "Pin"} ${TIER_LABELS[tier]} ${copy.label}`}
          onClick={() => onTogglePin({ category, tier })}
          className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${
            pinned
              ? "bg-violet-600 text-white"
              : "border border-zinc-300 text-zinc-900 dark:border-white/20 dark:text-zinc-100"
          }`}
        >
          {pinned ? "Pinned" : "Pin"}
        </button>
      ) : null}
    </li>
  );
}

function BadgesUnavailable() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Achievements</h1>
      <section className={`mt-5 flex flex-col items-center px-6 py-8 text-center ${panel}`}>
        <div className="flex -space-x-3" aria-hidden>
          <Badge category="collector" tier="bronze" size={56} locked label="" />
          <Badge category="streak" tier="gold" size={56} locked label="" />
          <Badge category="slab-king" tier="diamond" size={56} locked label="" />
        </div>
        <h2 className="mt-4 text-base font-semibold">Badges are on the way</h2>
        <p className="mt-1 max-w-xs text-sm leading-5 text-zinc-500">
          We&apos;re switching them on. Keep adding cards and posting, and your progress will be
          waiting.
        </p>
        <Link
          href="/cards/new"
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-semibold text-white"
        >
          Add a card
        </Link>
      </section>
    </div>
  );
}
