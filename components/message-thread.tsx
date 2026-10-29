"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, SendHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { DealSheet } from "@/components/deal-sheet";
import { DealThreadPanel } from "@/components/deal-response";
import { MessageAttachments } from "@/components/message-attachments";
import { CardMessagePreviewCard } from "@/components/open-to-offers";
import { useReducedMotion } from "@/components/timeline-ui";
import { MARK_SOLD_LABEL } from "@/lib/deals/state";
import { EmptyState, LoadingRows } from "@/components/status";
import { useSocial } from "@/components/social-provider";
import { signupPath } from "@/lib/auth/safe-next";
import { exactTime } from "@/lib/format";
import { offerCardForThread } from "@/lib/offers/open-to-offers";
import { seenMessageId, threadRows, threadTimeLabel } from "@/lib/social/dm-inbox";
import { userHref } from "@/lib/social/user-href";
import { MESSAGE_LIMIT, type DirectMessage } from "@/lib/social/types";

/**
 * Keys that showed up after the list first had content. The first batch is
 * remembered without animating, so opening a thread doesn't replay it.
 */
function useFreshKeys(keys: readonly string[], ready: boolean): ReadonlySet<string> {
  const signature = keys.join("\n");
  const [state, setState] = useState<{ signature: string; seen: ReadonlySet<string> | null; fresh: ReadonlySet<string> }>(
    () => ({ signature: "", seen: null, fresh: new Set() }),
  );
  if (ready && state.signature !== signature) {
    const seen = state.seen;
    const fresh = seen ? new Set([...state.fresh, ...keys.filter((key) => !seen.has(key))]) : state.fresh;
    setState({ signature, seen: new Set([...(seen ?? []), ...keys]), fresh });
    return fresh;
  }
  return state.fresh;
}

export function MessageThread({ username }: { username: string }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const {
    ready,
    user,
    messages,
    profileByUsername,
    sendMessage,
    markThreadRead,
    refresh,
    blockedIds,
    mutedIds,
    safetyAccounts,
    publicCards,
  } = useSocial();
  const searchParams = useSearchParams();
  const cardParam = searchParams.get("card");
  const partner = profileByUsername(username);
  const mutedPartner = Boolean(partner && mutedIds.includes(partner.id));
  const offerCard = useMemo(
    () =>
      offerCardForThread({
        cardId: cardParam,
        partnerId: partner?.id ?? null,
        viewerId: user?.id ?? null,
        blocked: Boolean(partner && blockedIds.includes(partner.id)),
        muted: mutedPartner,
        cards: publicCards,
      }),
    [blockedIds, cardParam, mutedPartner, partner, publicCards, user?.id],
  );
  const offerAttachment = offerCard ? { cardId: offerCard.id } : null;
  const [draft, setDraft] = useState("");
  const [dealOpen, setDealOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /** Sent from this screen and still on the way. Drawn at once, like X. */
  const [outbox, setOutbox] = useState<DirectMessage[]>([]);
  /** Just confirmed. Their saved copy slides in without a second rise. */
  const [settled, setSettled] = useState<readonly string[]>([]);
  const [openTime, setOpenTime] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const scrolledOnce = useRef(false);
  const thread = partner
    ? messages.filter(
        (message) =>
          (message.senderId === user?.id && message.receiverId === partner.id) ||
          (message.senderId === partner.id && message.receiverId === user?.id),
      )
    : [];

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, refresh, username]);

  useEffect(() => {
    if (!ready || !user || !partner) return;
    markThreadRead(partner.id);
  }, [markThreadRead, messages, partner, ready, user]);

  const sending = partner ? outbox.filter((message) => message.receiverId === partner.id) : [];
  const shownThread = sending.length ? [...thread, ...sending] : thread;

  const fresh = useFreshKeys(
    shownThread.map((message) => message.id),
    ready && Boolean(partner),
  );

  // Opening jumps to the newest message. Later messages glide into view.
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const glide = scrolledOnce.current && !reduceMotion && typeof node.scrollTo === "function";
    scrolledOnce.current = true;
    if (glide) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    else node.scrollTop = node.scrollHeight;
  }, [shownThread.length, partner?.id, reduceMotion]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !partner) return;
    if (!user) {
      router.push(signupPath(pathname));
      return;
    }
    const text = draft;
    const outgoing: DirectMessage = {
      id: `sending-${Date.now()}`,
      senderId: user.id,
      receiverId: partner.id,
      content: text.trim(),
      createdAt: new Date().toISOString(),
      read: false,
      kind: offerAttachment ? "card_preview" : "text",
      cardPreview: offerAttachment,
    };
    setPending(true);
    setOutbox((list) => [...list, outgoing]);
    setSettled([]);
    setDraft("");
    setError(null);
    if (fieldRef.current) fieldRef.current.style.height = "";
    const result = await sendMessage(partner.id, text, offerAttachment);
    setPending(false);
    setOutbox((list) => list.filter((message) => message.id !== outgoing.id));
    if (result.error) {
      // Not sent: the words come back so nothing is lost.
      setDraft((current) => current || text);
      setError(result.error);
      return;
    }
    setSettled([outgoing.content]);
  }

  if (!ready) {
    return (
      <div className="-mx-4 -mt-5">
        <LoadingRows count={2} />
      </div>
    );
  }

  const offerBlocked =
    Boolean(cardParam) &&
    Boolean(partner) &&
    Boolean(user) &&
    (blockedIds.includes(partner?.id ?? "") || mutedIds.includes(partner?.id ?? ""));
  const blockedPartner = safetyAccounts.find(
    (person) =>
      person.id !== user?.id &&
      blockedIds.includes(person.id) &&
      person.username.toLowerCase() === username.toLowerCase(),
  );
  if (blockedPartner || (offerBlocked && partner)) {
    const handle = blockedPartner?.username ?? partner?.username ?? username;
    return (
      <EmptyState
        title={blockedPartner ? `You've blocked @${handle}` : `You can't message @${handle}`}
        detail="You can't interact with this account."
      >
        <Link href="/messages" className="text-sm font-bold">
          Back to Messages
        </Link>
      </EmptyState>
    );
  }

  if (!partner || !user || partner.id === user.id) {
    return (
      <EmptyState title="That conversation isn't available.">
        <Link href="/messages" className="text-sm font-bold">
          Back to Messages
        </Link>
      </EmptyState>
    );
  }

  const seenId = seenMessageId(thread, user.id);
  const quiet = (message: DirectMessage) =>
    message.senderId === user.id && !message.id.startsWith("sending-") && settled.includes(message.content.trim());
  const canSend = !pending && Boolean(draft.trim() || offerAttachment);

  return (
    <div className="-mx-4 -mt-5 -mb-28 flex h-[calc(100dvh-3.5rem-6.15rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200/80 bg-[color-mix(in_oklab,var(--background)_88%,transparent)] px-2 py-1.5 backdrop-blur-xl dark:border-white/[0.08]">
        <button
          type="button"
          onClick={() => router.push("/messages")}
          data-nav-href="/messages"
          data-nav-back=""
          aria-label="Back to messages"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Link href={userHref(partner.username)} className="flex min-w-0 flex-1 items-center gap-2">
          <Avatar
            name={partner.displayName}
            image={partner.avatarDataUrl}
            accent={partner.accent}
            expandable={false}
            className="h-9 w-9"
          />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold leading-5">{partner.displayName}</span>
            <span className="block truncate text-xs text-zinc-500">@{partner.username}</span>
          </span>
        </Link>
        <button type="button" onClick={() => setDealOpen(true)} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-bold text-violet-700 dark:text-violet-300">
          {MARK_SOLD_LABEL}
        </button>
      </div>
      {dealOpen ? <DealSheet fixedBuyerId={partner.id} onClose={() => setDealOpen(false)} /> : null}
      <DealThreadPanel partnerId={partner.id} />

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-2">
        {shownThread.length === 0 ? (
          <ThreadHint
            name={partner.displayName}
            username={partner.username}
            avatar={partner.avatarDataUrl}
            accent={partner.accent}
          />
        ) : (
          threadRows(shownThread, user.id).map((row) => {
            if (row.kind === "gap") {
              return (
                <p
                  key={row.key}
                  data-thread-time=""
                  className="pt-4 pb-2 text-center text-[11px] font-semibold tracking-wide text-zinc-500"
                >
                  <time dateTime={row.at} title={exactTime(row.at)}>
                    {threadTimeLabel(row.at)}
                  </time>
                </p>
              );
            }
            return (
              <MessageRow
                key={row.key}
                message={row.message}
                mine={row.mine}
                first={row.first}
                last={row.last}
                fresh={fresh.has(row.message.id) && !quiet(row.message)}
                sending={row.message.id.startsWith("sending-")}
                timeOpen={openTime === row.message.id}
                onToggleTime={() => setOpenTime((current) => (current === row.message.id ? null : row.message.id))}
                seen={seenId === row.message.id}
              />
            );
          })
        )}
      </div>

      <form
        onSubmit={submit}
        className="shrink-0 border-t border-zinc-200/80 bg-[color-mix(in_oklab,var(--background)_92%,transparent)] px-3 py-2 backdrop-blur-xl dark:border-white/[0.08]"
      >
        {error ? <p className="mb-1 text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
        {offerAttachment ? (
          <div className="mb-2 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <CardMessagePreviewCard preview={offerAttachment} />
            </div>
            <button
              type="button"
              aria-label="Remove card"
              onClick={() => router.replace(userHref(partner.username, "messages"))}
              className="mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            ref={fieldRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value.slice(0, MESSAGE_LIMIT));
              const field = event.target;
              field.style.height = "auto";
              field.style.height = `${Math.min(field.scrollHeight, 128)}px`;
            }}
            rows={1}
            placeholder="Start a message"
            aria-label={`Message ${partner.displayName}`}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-[22px] border border-zinc-200 bg-white px-4 py-[11px] text-[15px] leading-5 outline-none placeholder:text-zinc-500 focus:border-violet-500/60 focus:ring-2 focus:ring-violet-600/20 dark:border-white/10 dark:bg-white/[0.06] dark:focus:border-violet-400/50"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!canSend}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-violet-600 text-white shadow-[0_8px_20px_-8px_rgba(124,58,237,0.8)] transition-[transform,opacity,box-shadow] duration-150 active:scale-90 disabled:bg-zinc-300 disabled:text-zinc-500 disabled:shadow-none motion-reduce:transition-none dark:disabled:bg-white/10 dark:disabled:text-zinc-500"
          >
            <SendHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageRow({
  message,
  mine,
  first,
  last,
  fresh,
  timeOpen,
  onToggleTime,
  seen,
  sending = false,
}: {
  message: DirectMessage;
  mine: boolean;
  first: boolean;
  last: boolean;
  /** Shown before the server confirms it. */
  sending?: boolean;
  /** Arrived after the thread opened: it rises in. */
  fresh: boolean;
  timeOpen: boolean;
  onToggleTime: () => void;
  seen: boolean;
}) {
  const text = message.content.trim() ? message.content : "";
  // Grouped bubbles: the corners facing the rest of the group tighten, and only the last gets a tail.
  const shape = mine
    ? `rounded-[20px] ${first ? "" : "rounded-tr-md"} ${last ? "rounded-br-[6px]" : "rounded-br-md"}`
    : `rounded-[20px] ${first ? "" : "rounded-tl-md"} ${last ? "rounded-bl-[6px]" : "rounded-bl-md"}`;
  const tone = mine
    ? "bg-gradient-to-br from-[#7C3AED] to-[#5B21B6] text-white shadow-[0_6px_16px_-10px_rgba(91,33,182,0.9)]"
    : "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100";
  return (
    <div
      data-message-row=""
      data-sending={sending ? "" : undefined}
      className={`flex ${mine ? "justify-end" : "justify-start"} ${first ? "mt-2.5" : "mt-0.5"} ${
        sending ? "opacity-70" : ""
      } transition-opacity duration-200 ${
        fresh ? "motion-safe:animate-[bubble-in_240ms_cubic-bezier(0.2,0.7,0.2,1)_both]" : ""
      }`}
      style={fresh ? { transformOrigin: mine ? "bottom right" : "bottom left" } : undefined}
    >
      <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {message.cardPreview ? <CardMessagePreviewCard preview={message.cardPreview} /> : null}
        {text ? (
          <div data-bubble={mine ? "mine" : "theirs"} className={`relative ${tone} ${shape}`}>
            {/* A div, not a button, so the text can still be long-pressed and copied on iOS. */}
            <div
              role="button"
              tabIndex={0}
              aria-expanded={timeOpen}
              onClick={onToggleTime}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onToggleTime();
              }}
              className="cursor-default rounded-[inherit] px-3.5 py-2 text-[15px] leading-5 break-words whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              {text}
            </div>
            {last ? <BubbleTail mine={mine} /> : null}
          </div>
        ) : null}
        {text ? <MessageAttachments text={text} /> : null}
        {timeOpen ? (
          <time
            data-bubble-time=""
            dateTime={message.createdAt}
            className="mt-1 px-1 text-[11px] text-zinc-500 motion-safe:animate-[add-fade_160ms_ease-out_both]"
          >
            {exactTime(message.createdAt)}
          </time>
        ) : null}
        {sending ? (
          <span data-sending-label="" className="mt-1 px-1 text-[11px] text-zinc-500">
            Sending…
          </span>
        ) : null}
        {seen ? (
          <span data-seen="" className="mt-1 px-1 text-[11px] font-semibold text-zinc-500">
            Seen
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A small curl at the bottom corner, in the bubble's own color. */
function BubbleTail({ mine }: { mine: boolean }) {
  return (
    <svg
      data-tail=""
      aria-hidden="true"
      viewBox="0 0 10 14"
      className={`absolute bottom-0 h-3.5 w-2.5 ${
        mine ? "-right-[5px] text-[#5B21B6]" : "-left-[5px] -scale-x-100 text-zinc-200 dark:text-zinc-800"
      }`}
    >
      <path d="M0 0c0 7 3.5 11.5 10 14H0z" fill="currentColor" />
    </svg>
  );
}

/** A new conversation: who it's with, and a nudge for the first message. */
function ThreadHint({
  name,
  username,
  avatar,
  accent,
}: {
  name: string;
  username: string;
  avatar: string | null;
  accent: string;
}) {
  return (
    <div data-thread-hint="" className="flex flex-col items-center px-6 pt-10 text-center">
      <span className="rounded-full p-1 ring-2 ring-violet-500/40">
        <Avatar name={name} image={avatar} accent={accent} expandable={false} className="h-16 w-16 text-base" />
      </span>
      <p className="mt-3 text-[17px] font-bold tracking-tight">{name}</p>
      <p className="text-[13px] text-zinc-500">@{username}</p>
      <p className="mt-4 max-w-[16rem] text-sm leading-5 text-zinc-500">
        This is the start of your conversation. Say hi, ask about a card, or talk pickups.
      </p>
    </div>
  );
}
