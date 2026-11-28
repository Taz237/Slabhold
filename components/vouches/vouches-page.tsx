"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BadgeCheck, ChevronDown, Handshake, Minus, ThumbsDown, ThumbsUp } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { LoadMore, useLoadMore } from "@/components/load-more";
import { goBack } from "@/components/nav-motion";
import { ReadRetry } from "@/components/read-retry";
import { SafetyMenu } from "@/components/safety-menu";
import { useSocial } from "@/components/social-provider";
import { EmptyState } from "@/components/status";
import { useVouchStore } from "@/components/use-vouch-store";
import { useVouchSummary } from "@/components/use-vouch-summary";
import { VouchReplySheet } from "@/components/vouches/vouch-sheet";
import { VouchRowsSkeleton, VouchSummarySkeleton, VouchesPageSkeleton } from "@/components/vouches/vouches-skeleton";
import { exactTime, timeAgo } from "@/lib/format";
import { useProfiles } from "@/lib/social/use-profiles";
import { userHref } from "@/lib/social/user-href";
import {
  breakdownShares,
  filterCount,
  filterFromParam,
  filterHref,
  lastVouchLabel,
  percentLabel,
  VOUCH_FILTERS,
  vouchAnchorId,
  voucherMeta,
  vouchIdFromHash,
  type VouchFilter,
} from "@/lib/vouches/page";
import { breakdownLine, socialProofLine, VOUCH_COPY, type VouchRating, type VouchSummary } from "@/lib/vouches/rules";
import type { VouchCursor, VouchRow } from "@/lib/vouches/types";

/** A vouch notice or the admin link can point at a vouch that is pages down: read this many pages looking for it. */
const ANCHOR_PAGES = 6;

const RATING_ICON = { positive: ThumbsUp, neutral: Minus, negative: ThumbsDown } satisfies Record<VouchRating, typeof ThumbsUp>;

/** The bar's colors: purple for positive, two greys for the rest. Red is only ever the thumbs-down icon. */
const BAR_COLOR: Record<VouchRating, string> = {
  positive: "bg-violet-600 dark:bg-violet-500",
  neutral: "bg-zinc-400 dark:bg-zinc-500",
  negative: "bg-zinc-600 dark:bg-zinc-300",
};

export function RatingChip({ rating }: { rating: VouchRating }) {
  const Icon = RATING_ICON[rating];
  const tone =
    rating === "positive"
      ? "bg-violet-600/10 text-violet-700 dark:bg-violet-400/15 dark:text-[#A78BFA]"
      : "bg-zinc-200/80 text-zinc-700 dark:bg-white/10 dark:text-zinc-300";
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium ${tone}`}>
      <Icon aria-hidden="true" className={`h-3.5 w-3.5 ${rating === "negative" ? "text-rose-600 dark:text-rose-400" : ""}`} strokeWidth={1.75} />
      {VOUCH_COPY.ratings[rating]}
    </span>
  );
}

/** The count, the percent, one bar, and what the numbers mean. */
export function VouchSummaryCard({ summary, now }: { summary: VouchSummary; now?: Date }) {
  const percent = percentLabel(summary);
  const shares = breakdownShares(summary);
  const last = lastVouchLabel(summary.lastVouchAt, now);
  const proof = socialProofLine(summary);
  const none = summary.total <= 0;
  return (
    <section aria-label={VOUCH_COPY.pageTitle} className="mx-4 mt-4 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
      {none ? null : (
        <>
          <div className="flex items-end justify-between gap-3">
            <p className="flex items-baseline gap-2">
              <span className="text-[2.5rem] leading-10 font-medium tracking-tight tabular-nums">{summary.total.toLocaleString("en-US")}</span>
              <span className="text-15 text-zinc-500">{summary.total === 1 ? "vouch" : "vouches"}</span>
            </p>
            {percent ? (
              <p className="inline-flex items-center gap-1.5 pb-1 text-15 font-semibold text-violet-700 dark:text-[#A78BFA]">
                <BadgeCheck aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
                <span className="tabular-nums">{percent}</span>
              </p>
            ) : null}
          </div>
          <div aria-hidden="true" className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full">
            {shares.map((share) => (
              <span key={share.rating} className={`h-full min-w-1.5 ${BAR_COLOR[share.rating]}`} style={{ width: `${share.percent}%` }} />
            ))}
          </div>
          <p className="mt-3 text-sm tabular-nums text-zinc-700 dark:text-zinc-300">{breakdownLine(summary)}</p>
          {last ? <p className="mt-1 text-sm text-zinc-500">{last}</p> : null}
          {proof ? <p className="mt-1 text-sm text-zinc-500">{proof}</p> : null}
        </>
      )}
      {/* With no vouches yet, the card is just the explainer, already open. */}
      <details open={none} className={`group ${none ? "" : "mt-3 border-t border-zinc-200 pt-1 dark:border-white/10"}`}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          {VOUCH_COPY.howItWorksTitle}
          <ChevronDown aria-hidden="true" className="h-4 w-4 text-zinc-500 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <ul className="list-disc space-y-1.5 pb-1 pl-5 text-sm leading-5 text-zinc-700 dark:text-zinc-300">
          {VOUCH_COPY.howItWorks.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-3 pb-2 text-13 leading-5 text-zinc-500">{VOUCH_COPY.pageFootnote}</p>
      </details>
    </section>
  );
}

/** All / Positive / Neutral / Negative, with everyone's counts, and one underline that slides. */
export function VouchTabs({ filter, summary, onChange }: { filter: VouchFilter; summary: VouchSummary | null; onChange: (next: VouchFilter) => void }) {
  const index = Math.max(0, VOUCH_FILTERS.indexOf(filter));
  return (
    <div role="tablist" aria-label={VOUCH_COPY.filterLabel} className="relative mt-4 grid grid-cols-4 border-b border-zinc-200 text-13 min-[400px]:text-sm dark:border-white/10">
      {VOUCH_FILTERS.map((item) => {
        const count = filterCount(summary, item);
        const active = item === filter;
        return (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item)}
            className={`tap-fade flex min-h-11 min-w-0 items-center justify-center gap-1 px-1 font-medium ${active ? "font-semibold" : "text-zinc-500"}`}
          >
            <span className="truncate">{VOUCH_COPY.filters[item]}</span>
            {count === null ? null : <span className="text-xs tabular-nums text-zinc-500">{count}</span>}
          </button>
        );
      })}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 flex h-1 w-1/4 justify-center transition-transform duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none"
        style={{ transform: `translateX(${index * 100}%)` }}
      >
        <span className="block h-full w-8 max-w-[70%] rounded-full bg-zinc-900 dark:bg-zinc-100" />
      </span>
    </div>
  );
}

/** One vouch: who left it, the rating, the note, and the subject's reply under it. */
export function VouchRowItem({
  row,
  subject,
  highlighted = false,
  now,
  showMenus = true,
  onReply,
  onReplyWarm,
}: {
  row: VouchRow;
  subject: { id: string; username: string };
  highlighted?: boolean;
  now?: Date;
  /** On your own page: opens the reply sheet for this vouch. */
  onReply?: () => void;
  onReplyWarm?: () => void;
  /** Off in tests that draw a row without the app around it. */
  showMenus?: boolean;
}) {
  const voucher = row.voucher;
  const when = timeAgo(row.createdAt, now);
  const meta = voucherMeta(voucher.vouchTotal, voucher.createdAt);
  return (
    <li
      id={vouchAnchorId(row.id)}
      data-highlighted={highlighted ? "" : undefined}
      className={`scroll-mt-20 border-b border-zinc-200 px-4 py-4 transition-colors duration-700 motion-reduce:transition-none dark:border-white/10 ${
        highlighted ? "bg-violet-600/[0.07] dark:bg-violet-400/10" : ""
      }`}
    >
      <div className="flex gap-3">
        <Link href={userHref(voucher.username)} aria-label={`${voucher.displayName} (@${voucher.username})`} className="shrink-0 self-start rounded-full">
          <Avatar name={voucher.displayName} image={voucher.avatarUrl} accent={voucher.accent ?? undefined} expandable={false} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <Link href={userHref(voucher.username)} className="min-w-0 flex-1 hover:underline">
              <span className="block truncate text-15 leading-5 font-semibold">{voucher.displayName}</span>
              <span className="block truncate text-13 leading-5 text-zinc-500">
                @{voucher.username}
                {when ? (
                  <time dateTime={row.createdAt} title={exactTime(row.createdAt)}>
                    {" "}
                    · {when}
                  </time>
                ) : null}
              </span>
            </Link>
            <RatingChip rating={row.rating} />
            {showMenus ? <SafetyMenu targetType="vouch" targetId={row.id} reportedUserId={voucher.id} username={voucher.username} /> : null}
          </div>
          {row.note ? <p className="mt-2 text-15 leading-[1.4] break-words whitespace-pre-line text-zinc-900 dark:text-zinc-100">{row.note}</p> : null}
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-13 text-zinc-500">
            {row.hasLoggedDeal ? (
              <span className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
                <Handshake aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
                {VOUCH_COPY.loggedDeal}
              </span>
            ) : null}
            {row.editedAt ? <span title={exactTime(row.editedAt)}>{VOUCH_COPY.edited}</span> : null}
            {meta ? <span>{meta}</span> : null}
          </p>
          {row.reply ? (
            <div className="mt-3 flex gap-2 border-l-2 border-zinc-200 pl-3 dark:border-white/15">
              <div className="min-w-0 flex-1">
                <p className="text-13 font-medium text-zinc-500">
                  {VOUCH_COPY.replyFrom(subject.username)}
                  {row.replyEditedAt ? <span title={exactTime(row.replyEditedAt)}> · {VOUCH_COPY.edited}</span> : null}
                </p>
                <p className="mt-0.5 text-15 leading-[1.4] break-words whitespace-pre-line text-zinc-800 dark:text-zinc-200">{row.reply}</p>
              </div>
              {showMenus ? <SafetyMenu targetType="vouch_reply" targetId={row.id} reportedUserId={subject.id} username={subject.username} /> : null}
            </div>
          ) : null}
          {onReply ? (
            <button
              type="button"
              onClick={onReply}
              onPointerDown={onReplyWarm}
              onFocus={onReplyWarm}
              className="-ml-3 mt-1 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-violet-700 dark:text-[#A78BFA]"
            >
              {row.reply ? VOUCH_COPY.editReply : VOUCH_COPY.reply}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** What the list says when it has no rows. The counts are everyone's, so "none" and "none you can see" differ. */
export function VouchesEmpty({ filter, own, username, hiddenFromReader }: { filter: VouchFilter; own: boolean; username: string; hiddenFromReader: boolean }) {
  const icon = <BadgeCheck className="h-5 w-5" strokeWidth={1.75} />;
  if (hiddenFromReader) return <EmptyState icon={icon} title={VOUCH_COPY.emptyHiddenTitle} detail={VOUCH_COPY.emptyHidden} />;
  if (filter !== "all") return <EmptyState icon={icon} title={VOUCH_COPY.emptyFilter[filter]} />;
  return <EmptyState icon={icon} title={VOUCH_COPY.none} detail={own ? VOUCH_COPY.emptyOwn : VOUCH_COPY.emptyOther(username)} />;
}

type Loaded = { key: string; rows: VouchRow[]; next: VouchCursor | null };
type ListReader = { list: ReturnType<typeof useVouchStore>["store"]["list"] };

/** One person's vouches under one filter, a page at a time. Null `subjectId` reads nothing. */
function useVouchList(store: ListReader, subjectId: string | null, filter: VouchFilter) {
  const key = subjectId ? `${subjectId}:${filter}` : "";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;
    const pageKey = `${subjectId}:${filter}`;
    store.list(subjectId, { rating: filter === "all" ? null : filter }).then(
      (page) => {
        if (!cancelled) setLoaded({ key: pageKey, rows: page.rows, next: page.next });
      },
      () => {
        if (!cancelled) setFailedKey(pageKey);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, filter, store, subjectId]);
  const current = loaded?.key === key ? loaded : null;
  const loadMore = useCallback(async () => {
    if (!subjectId || !current?.next) return;
    const page = await store.list(subjectId, { rating: filter === "all" ? null : filter, before: current.next });
    setLoaded((latest) => {
      if (latest?.key !== current.key) return latest;
      const seen = new Set(latest.rows.map((row) => row.id));
      return { key: latest.key, rows: [...latest.rows, ...page.rows.filter((row) => !seen.has(row.id))], next: page.next };
    });
  }, [current, filter, store, subjectId]);
  const retry = useCallback(() => {
    setFailedKey(null);
    setAttempt((value) => value + 1);
  }, []);
  /** A reply saved or removed on this page shows at once, without reading the list again. */
  const setReply = useCallback((vouchId: string, reply: string | null) => {
    const stamp = new Date().toISOString();
    setLoaded((latest) =>
      latest
        ? {
            ...latest,
            rows: latest.rows.map((row) =>
              row.id !== vouchId
                ? row
                : { ...row, reply, replyAt: reply ? (row.reply ? row.replyAt : stamp) : null, replyEditedAt: reply && row.reply ? stamp : null },
            ),
          }
        : latest,
    );
  }, []);
  return { current, failed: !current && Boolean(key) && failedKey === key, loadMore, retry, setReply };
}

/** Everyone can read a person's vouches and replies here. */
export function VouchesPage({ username }: { username: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { ready, user, profileByUsername } = useSocial();
  const profile = profileByUsername(username);
  const profileRead = useProfiles(!profile ? { usernames: [username] } : null);
  const { store, supported, pending } = useVouchStore();
  const { summary } = useVouchSummary(profile?.id);
  const filter = filterFromParam(params.get("rating"));
  const subjectId = profile?.id ?? null;

  const list = useVouchList(store, subjectId && supported ? subjectId : null, filter);
  const current = list.current;
  const [highlight, setHighlight] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const anchorPages = useRef(0);
  const anchorDone = useRef<string | null>(null);
  const more = useLoadMore(list.loadMore);
  const runMore = more.run;
  const moreBusy = more.loading;
  const moreFailed = more.failed;

  // #vouch-<id>: scroll to that vouch and mark it for a moment. If it isn't on the pages read so
  // far, read a few more looking for it. A vouch that is gone (removed, hidden, or from someone
  // in a block with the reader) is simply not found: the page stays where it is.
  useEffect(() => {
    if (!current || typeof window === "undefined") return;
    const wanted = vouchIdFromHash(window.location.hash);
    if (!wanted || anchorDone.current === wanted) return;
    if (current.rows.some((row) => row.id === wanted)) {
      anchorDone.current = wanted;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const frame = window.requestAnimationFrame(() => {
        document.getElementById(vouchAnchorId(wanted))?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        setHighlight(wanted);
      });
      const timer = window.setTimeout(() => setHighlight(null), 2400);
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(timer);
      };
    }
    if (current.next && !moreBusy && !moreFailed && anchorPages.current < ANCHOR_PAGES) {
      anchorPages.current += 1;
      runMore();
    } else if (!current.next || anchorPages.current >= ANCHOR_PAGES) {
      anchorDone.current = wanted;
    }
  }, [current, moreBusy, moreFailed, runMore]);

  function setFilter(next: VouchFilter) {
    if (next !== filter) router.replace(filterHref(pathname, next), { scroll: false });
  }

  if (!profile && profileRead.failed) return <ReadRetry title="Couldn't load this profile" onRetry={profileRead.retry} />;
  if (!ready || (!profile && !profileRead.ready) || pending) return <VouchesPageSkeleton />;
  if (!profile || !supported) {
    return (
      <EmptyState title={VOUCH_COPY.unavailable}>
        <Link href="/" className="text-sm font-semibold">
          Back to Home
        </Link>
      </EmptyState>
    );
  }

  const own = Boolean(user && user.id === profile.id);
  const backHref = userHref(profile.username);
  const failed = list.failed;
  // The counts cover everyone. The list leaves out people in a block with the reader, so it can
  // be shorter, or empty, while the count is not. The two are never checked against each other.
  const replyRow = own && replyTo ? (current?.rows.find((row) => row.id === replyTo) ?? null) : null;
  const hiddenFromReader = Boolean(current && current.rows.length === 0 && (filterCount(summary, filter) ?? 0) > 0);

  return (
    <div className="-mx-4 -mt-5">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-2 py-2 dark:border-white/10">
        <button
          type="button"
          onClick={() => goBack({ to: backHref, push: (href) => router.push(href) })}
          data-nav-href={backHref}
          data-nav-back=""
          aria-label={VOUCH_COPY.backToProfile}
          className="hit-44 grid h-9 w-9 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg leading-6 font-semibold">{VOUCH_COPY.pageTitle}</h1>
          <p className="truncate text-xs text-zinc-500">@{profile.username}</p>
        </div>
      </div>

      {summary ? <VouchSummaryCard summary={summary} /> : <VouchSummarySkeleton />}
      {/* Nothing to filter until there is a vouch. A shared ?rating= link still shows its tab. */}
      {summary && summary.total <= 0 && filter === "all" ? (
        <div className="mt-4 border-b border-zinc-200 dark:border-white/10" />
      ) : (
        <VouchTabs filter={filter} summary={summary} onChange={setFilter} />
      )}

      <div className="min-h-[40dvh]">
        {failed ? (
          <ReadRetry title={VOUCH_COPY.loadFailed.replace(/ Try again\.$/, "")} compact onRetry={list.retry} />
        ) : !current ? (
          <VouchRowsSkeleton />
        ) : current.rows.length === 0 ? (
          <VouchesEmpty filter={filter} own={own} username={profile.username} hiddenFromReader={hiddenFromReader} />
        ) : (
          <>
            <ul>
              {current.rows.map((row) => (
                <VouchRowItem
                  key={row.id}
                  row={row}
                  subject={profile}
                  highlighted={highlight === row.id}
                  onReply={own ? () => setReplyTo(row.id) : undefined}
                  onReplyWarm={own ? VouchReplySheet.warm : undefined}
                />
              ))}
            </ul>
            <LoadMore hasMore={Boolean(current.next)} loading={more.loading} failed={more.failed} onLoadMore={more.run} />
            {replyRow ? (
              <VouchReplySheet
                vouch={replyRow}
                voucherUsername={replyRow.voucher.username}
                onClose={() => setReplyTo(null)}
                onSaved={(reply) => list.setReply(replyRow.id, reply)}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
