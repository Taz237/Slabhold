"use client";

import { goBack } from "@/components/nav-motion";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, SendHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { DealSheet } from "@/components/deal-sheet";
import { DealThreadPanel } from "@/components/deal-response";
import { MentionText } from "@/components/mention-text";
import { MessageAttachments } from "@/components/message-attachments";
import { CardMessagePreviewCard } from "@/components/open-to-offers";
import { MARK_SOLD_LABEL } from "@/lib/deals/state";
import { EmptyState, LoadingRows } from "@/components/status";
import { useLoadMore } from "@/components/load-more";
import { useSocial } from "@/components/social-provider";
import { useCollection } from "@/components/collection-provider";
import { usePublicCards } from "@/lib/social/use-public-cards";
import { useProfiles } from "@/lib/social/use-profiles";
import { ReadRetry } from "@/components/read-retry";
import { SafetyMenu } from "@/components/safety-menu";
import { signupPath } from "@/lib/auth/safe-next";
import { exactTime } from "@/lib/format";
import { haptic } from "@/lib/ios/haptics";
import { offerCardForThread } from "@/lib/offers/open-to-offers";
import { seenMessageId, threadRows, threadTimeLabel } from "@/lib/social/dm-inbox";
import { dealCardFromThread } from "@/lib/deals/thread-card";
import { askPriceDraft } from "@/lib/social/post-dm";
import { userHref } from "@/lib/social/user-href";
import { MESSAGE_LIMIT, type DirectMessage } from "@/lib/social/types";
import { TeamBadge } from "@/components/team-badge";
import { useKeyboardInset } from "@/lib/ui/use-keyboard-inset";
import {
  ReactionBar,
  ReactionPillButton,
  ReactionsSheet,
  reactionHaptic,
  useBubbleGestures,
  type ReactionPerson,
} from "@/components/message-reactions";
import {
  DOUBLE_TAP_EMOJI,
  REACTION_NAMES,
  reactionPill,
  reactionsFor,
  type MessageReaction,
  type ReactionEmoji,
} from "@/lib/social/message-reactions";
import { useMessageReactions } from "@/lib/social/use-message-reactions";
import { followsNewMessage, threadAtBottom, threadHeight } from "@/lib/ui/thread-height";

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
    loadThreadMessages,
    threadMore,
    refreshInbox,
    blockedIds,
    mutedIds,
    safetyAccounts,
    publicCards,
    findPost,
  } = useSocial();
  const { cards } = useCollection();
  const searchParams = useSearchParams();
  const cardParam = searchParams.get("card");
  // Ask price: the post's link, with "How much?" ready in the box. Never sent on its own.
  const postParam = searchParams.get("post");
  usePublicCards({ ids: [cardParam] });
  const partner = profileByUsername(username);
  // A new conversation can name someone the snapshot didn't bring: read them by handle.
  const partnerRead = useProfiles(partner ? null : { usernames: [username] });
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
  /**
   * The ?card= this thread already sent. A sent card is detached at once, so the
   * next message is text only, even before the URL drops the param.
   */
  const [sentCard, setSentCard] = useState<string | null>(null);
  if (sentCard && cardParam !== sentCard) setSentCard(null);
  const offerAttachment = offerCard && offerCard.id !== sentCard ? { cardId: offerCard.id } : null;
  const [draft, setDraft] = useState("");
  /** The ?post= this thread already put in the box, so it fills once. */
  const [prefilled, setPrefilled] = useState<string | null>(null);
  const [dealOpen, setDealOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /** Sent from this screen and still on the way. Drawn at once, like X. */
  const [outbox, setOutbox] = useState<DirectMessage[]>([]);
  /** Just confirmed. Their saved copy slides in without a second rise. */
  const [settled, setSettled] = useState<readonly string[]>([]);
  const [openTime, setOpenTime] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // The keyboard's height, from the iOS app's events or Safari's visual viewport.
  const keyboardInset = useKeyboardInset();
  const scrolledOnce = useRef(false);
  /** The reader is at the newest message, so new content keeps it in view. */
  const pinned = useRef(true);
  const thread = partner
    ? messages.filter(
        (message) =>
          (message.senderId === user?.id && message.receiverId === partner.id) ||
          (message.senderId === partner.id && message.receiverId === user?.id),
      )
    : [];

  useEffect(() => {
    if (!ready) return;
    // The thread reads its own page (loadThreadMessages); this keeps the inbox badge current.
    void refreshInbox().catch(() => {});
  }, [ready, refreshInbox, username]);

  useEffect(() => {
    if (!ready || !user || !partner) return;
    markThreadRead(partner.id);
  }, [markThreadRead, messages, partner, ready, user]);

  // The inbox reads only its newest messages, so a thread reads its own newest page.
  const partnerId = partner?.id ?? null;
  useEffect(() => {
    if (!ready || !user || !partnerId) return;
    void loadThreadMessages(partnerId).catch(() => {});
  }, [loadThreadMessages, partnerId, ready, user]);

  // The Ask price draft is two lines: grow the box to fit, as typing does.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!prefilled || !field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 128)}px`;
  }, [prefilled]);

  /** Distance from the bottom before older messages were added above, so the view holds still. */
  const holdFromBottom = useRef<number | null>(null);
  const loadOlder = useCallback(async () => {
    if (!partnerId) return;
    const node = scroller.current;
    holdFromBottom.current = node ? node.scrollHeight - node.scrollTop : null;
    await loadThreadMessages(partnerId, true);
  }, [loadThreadMessages, partnerId]);
  const older = useLoadMore(loadOlder);

  const sending = partner ? outbox.filter((message) => message.receiverId === partner.id) : [];
  const shownThread = sending.length ? [...thread, ...sending] : thread;

  const fresh = useFreshKeys(
    shownThread.map((message) => message.id),
    ready && Boolean(partner),
  );

  // Reactions: double-tap for a heart, long-press for the bar. Live for both people.
  const { reactions, available: reactionsOn, react } = useMessageReactions(
    partner ? (user?.id ?? null) : null,
    thread.map((message) => message.id),
  );
  /** The message whose emoji bar is open. One at a time. */
  const [barFor, setBarFor] = useState<string | null>(null);
  /** The message whose "who reacted" sheet is open. */
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const reactTo = useCallback(
    (messageId: string, emoji: ReactionEmoji) => {
      void react(messageId, emoji).then((result) => {
        if (result.error) setError(result.error);
      });
    },
    [react],
  );

  // Opening jumps to the newest message. Later messages glide into view.
  // Keyed on the newest message, so older ones loading above don't move it.
  const newestId = shownThread[shownThread.length - 1]?.id ?? null;
  const oldestId = shownThread[0]?.id ?? null;
  // Before paint, so the thread never shows its top for a frame. The new
  // bubble rises in on its own (bubble-in), so the list itself does not glide.
  const newestOwn = shownThread[shownThread.length - 1]?.senderId === user?.id;
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const first = !scrolledOnce.current;
    scrolledOnce.current = true;
    if (!followsNewMessage({ first, pinned: pinned.current, own: newestOwn })) return;
    node.scrollTop = node.scrollHeight;
    pinned.current = true;
  }, [newestId, newestOwn, partner?.id]);

  // The keyboard opened or closed: the thread changed height. If the newest
  // message was in view it stays in view, in the same frame.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (node && pinned.current) node.scrollTop = node.scrollHeight;
    // iOS can scroll the whole page to reveal the box. The thread already
    // ends at the keyboard, so put the page back: the header never jumps.
    if (keyboardInset > 0 && window.scrollY !== 0) window.scrollTo(0, 0);
  }, [keyboardInset]);

  // Stay pinned while the reader is at the bottom: a shared post or card that
  // fills in, a photo that loads or the deal panel changing height never
  // leaves the newest message under the composer.
  const threadShown = Boolean(partner) && ready;
  useEffect(() => {
    const node = scroller.current;
    if (!node || !threadShown) return;
    const repin = () => {
      if (pinned.current) node.scrollTop = node.scrollHeight;
    };
    const onScroll = () => {
      pinned.current = threadAtBottom(node);
    };
    const grown = typeof MutationObserver === "function" ? new MutationObserver(repin) : null;
    grown?.observe(node, { childList: true, subtree: true });
    const resized = typeof ResizeObserver === "function" ? new ResizeObserver(repin) : null;
    resized?.observe(node);
    node.addEventListener("load", repin, true);
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      grown?.disconnect();
      resized?.disconnect();
      node.removeEventListener("load", repin, true);
      node.removeEventListener("scroll", onScroll);
    };
  }, [threadShown]);

  // Older messages landed above: keep what was on screen where it was.
  useLayoutEffect(() => {
    const node = scroller.current;
    const hold = holdFromBottom.current;
    if (!node || hold === null) return;
    holdFromBottom.current = null;
    node.scrollTop = node.scrollHeight - hold;
  }, [oldestId]);

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
    haptic("send");
    setSettled([outgoing.content]);
    if (offerAttachment) {
      // Sent once: take it out of the composer and the URL. Other params (?post=) stay.
      setSentCard(offerAttachment.cardId);
      const rest = new URLSearchParams(searchParams.toString());
      rest.delete("card");
      const query = rest.toString();
      router.replace(`${userHref(partner.username, "messages")}${query ? `?${query}` : ""}`);
    }
  }

  if (!partner && partnerRead.failed) {
    return <ReadRetry title="Couldn't load this conversation" onRetry={partnerRead.retry} />;
  }

  if (!ready || (!partner && !partnerRead.ready)) {
    return (
      <div className="-mx-4 -mt-5">
        <LoadingRows count={2} />
      </div>
    );
  }

  const offerBlocked =
    Boolean(partner) &&
    Boolean(user) &&
    ((Boolean(cardParam) && (blockedIds.includes(partner?.id ?? "") || mutedIds.includes(partner?.id ?? ""))) ||
      (Boolean(postParam) && blockedIds.includes(partner?.id ?? "")));
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
        <Link href="/messages" className="text-sm font-semibold">
          Back to Messages
        </Link>
      </EmptyState>
    );
  }

  if (!partner || !user || partner.id === user.id) {
    return (
      <EmptyState title="That conversation isn't available.">
        <Link href="/messages" className="text-sm font-semibold">
          Back to Messages
        </Link>
      </EmptyState>
    );
  }

  if (postParam && prefilled !== postParam) {
    setPrefilled(postParam);
    if (!draft.trim()) setDraft(askPriceDraft(postParam));
  }

  const seenId = seenMessageId(thread, user.id);
  const quiet = (message: DirectMessage) =>
    message.senderId === user.id && !message.id.startsWith("sending-") && settled.includes(message.content.trim());
  const canSend = !pending && Boolean(draft.trim() || offerAttachment);

  return (
    <div data-dm-thread="" data-keyboard-inset={keyboardInset} className="-mx-4 -mt-5 -mb-28 flex flex-col" style={{ height: threadHeight(keyboardInset) }}>
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200/80 glass bg-[color-mix(in_oklab,var(--background)_88%,transparent)] px-2 py-1.5 backdrop-blur-xl dark:border-white/[0.08]">
        <button
          type="button"
          onClick={() => goBack({ to: "/messages", push: (href) => router.push(href) })}
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
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate text-15 font-semibold leading-5">{partner.displayName}</span>
              <TeamBadge username={partner.username} inLink />
            </span>
            <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">@{partner.username}</span>
          </span>
        </Link>
        <button type="button" onClick={() => setDealOpen(true)} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-semibold text-violet-700 dark:text-violet-300">
          {MARK_SOLD_LABEL}
        </button>
        <SafetyMenu
          targetType="user"
          targetId={partner.id}
          reportedUserId={partner.id}
          username={partner.username}
        />
      </div>
      {dealOpen ? (
        <DealSheet
          fixedBuyerId={partner.id}
          initialCardId={dealCardFromThread(thread, findPost, cards)}
          onClose={() => setDealOpen(false)}
        />
      ) : null}
      <DealThreadPanel partnerId={partner.id} />

      {sheetFor ? (
        <ReactionsSheet
          people={reactionPeople(reactionsFor(reactions, sheetFor), user, partner)}
          onRemove={() => {
            const mine = reactionsFor(reactions, sheetFor).find((item) => item.userId === user.id);
            setSheetFor(null);
            if (mine) reactTo(sheetFor, mine.emoji);
          }}
          onClose={() => setSheetFor(null)}
        />
      ) : null}

      <div ref={scroller} data-thread-scroller="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-2">
        {partnerId && threadMore(partnerId) ? (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={older.run}
              disabled={older.loading}
              className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-violet-700 disabled:opacity-60 dark:text-violet-300"
            >
              {older.loading ? "Loading…" : older.failed ? "Try again" : "Load older messages"}
            </button>
          </div>
        ) : null}
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
                  className="pt-4 pb-2 text-center text-13 font-medium text-zinc-500 dark:text-zinc-400"
                >
                  <time dateTime={row.at} title={exactTime(row.at)}>
                    {threadTimeLabel(row.at)}
                  </time>
                </p>
              );
            }
            const rowReactions = reactionsFor(reactions, row.message.id);
            return (
              <MessageRow
                key={row.key}
                reactions={rowReactions}
                viewerId={user.id}
                partnerName={partner.displayName}
                canReact={reactionsOn && !row.message.id.startsWith("sending-")}
                barOpen={barFor === row.message.id}
                onOpenBar={() => setBarFor(row.message.id)}
                onCloseBar={() => setBarFor((current) => (current === row.message.id ? null : current))}
                onReact={(emoji, via) => {
                  const mine = rowReactions.find((item) => item.userId === user.id)?.emoji ?? null;
                  setBarFor(null);
                  reactionHaptic(via);
                  // A double tap only ever adds the heart; it never takes it away.
                  if (via === "double" && mine === emoji) return;
                  reactTo(row.message.id, emoji);
                }}
                onShowReactions={() => setSheetFor(row.message.id)}
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
        className="shrink-0 border-t border-zinc-200/80 glass bg-[color-mix(in_oklab,var(--background)_92%,transparent)] px-3 py-2 backdrop-blur-xl dark:border-white/[0.08]"
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
            className="max-h-32 min-h-11 flex-1 resize-none rounded-[22px] border border-zinc-200 bg-white px-4 py-[11px] text-15 leading-5 outline-none placeholder:text-zinc-500 focus:border-violet-500/60 focus:ring-2 focus:ring-violet-600/20 dark:border-white/10 dark:bg-white/[0.06] dark:focus:border-violet-400/50"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!canSend}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-violet-600 text-white transition-[transform,opacity] duration-150 active:scale-90 disabled:bg-zinc-300 disabled:text-zinc-500 motion-reduce:transition-none dark:disabled:bg-white/10 dark:disabled:text-zinc-500"
          >
            <SendHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}

type Person = { id: string; displayName: string; username: string; avatarDataUrl: string | null; accent: string };

/** The people in a pill, oldest reaction first, for the sheet. */
function reactionPeople(list: MessageReaction[], user: Person, partner: Person): ReactionPerson[] {
  return list.flatMap((item) => {
    const person = item.userId === user.id ? user : item.userId === partner.id ? partner : null;
    if (!person) return [];
    return [
      {
        userId: item.userId,
        emoji: item.emoji,
        you: person.id === user.id,
        name: person.displayName,
        username: person.username,
        avatar: person.avatarDataUrl,
        accent: person.accent,
      },
    ];
  });
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
  reactions,
  viewerId,
  partnerName,
  canReact,
  barOpen,
  onOpenBar,
  onCloseBar,
  onReact,
  onShowReactions,
}: {
  reactions: MessageReaction[];
  viewerId: string;
  partnerName: string;
  /** Off while sending, or before the reactions table exists. */
  canReact: boolean;
  barOpen: boolean;
  onOpenBar: () => void;
  onCloseBar: () => void;
  onReact: (emoji: ReactionEmoji, via: "double" | "bar") => void;
  onShowReactions: () => void;
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
    ? "bg-[#7C3AED] text-white"
    : "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100";
  const reactable = canReact && Boolean(text);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(false);
  const gestures = useBubbleGestures({
    enabled: reactable,
    onTap: onToggleTime,
    onDoubleTap: () => onReact(DOUBLE_TAP_EMOJI, "double"),
    onLongPress: () => {
      // Near the top of the thread the bar would be cut off: open it under the bubble.
      const bubble = bubbleRef.current?.getBoundingClientRect();
      const scroller = bubbleRef.current?.closest("[data-thread-scroller]")?.getBoundingClientRect();
      setBelow(Boolean(bubble && scroller && bubble.top - scroller.top < 64));
      onOpenBar();
    },
  });
  const pill = reactionPill(reactions, viewerId);
  const mineReaction = pill?.mine ?? null;
  const pillLabel = reactions
    .map((item) => `${item.userId === viewerId ? "You" : partnerName} reacted ${REACTION_NAMES[item.emoji]}`)
    .join(", ");
  const closeBar = () => {
    onCloseBar();
    bubbleRef.current?.focus({ preventScroll: true });
  };
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
            {/* With reactions on, a long-press opens the bar (with Copy) instead of the iOS callout. */}
            <div
              ref={bubbleRef}
              role="button"
              tabIndex={0}
              aria-expanded={timeOpen}
              aria-haspopup={reactable ? "menu" : undefined}
              aria-keyshortcuts={reactable ? "Shift+F10" : undefined}
              {...gestures}
              onKeyDown={(event) => {
                if (reactable && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {
                  event.preventDefault();
                  setBelow(false);
                  onOpenBar();
                  return;
                }
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onToggleTime();
              }}
              className={`cursor-default rounded-[inherit] px-3.5 py-2 text-15 leading-5 break-words whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                reactable ? "touch-manipulation select-none [-webkit-touch-callout:none]" : ""
              }`}
            >
              <MentionText
                text={message.content}
                linkClassName={
                  mine
                    ? "font-medium break-all text-white underline decoration-white/70 underline-offset-2"
                    : "font-medium break-all text-violet-700 underline decoration-violet-700/70 underline-offset-2 dark:text-violet-300 dark:decoration-violet-300/80"
                }
              />
            </div>
            {last ? <BubbleTail mine={mine} /> : null}
            {barOpen ? (
              <ReactionBar
                mine={mine}
                current={mineReaction}
                below={below}
                onPick={(emoji) => {
                  onReact(emoji, "bar");
                  bubbleRef.current?.focus({ preventScroll: true });
                }}
                onCopy={() => {
                  void navigator.clipboard?.writeText(message.content).catch(() => {});
                  closeBar();
                }}
                onClose={closeBar}
              />
            ) : null}
          </div>
        ) : null}
        {pill ? <ReactionPillButton pill={pill} mine={mine} label={pillLabel} onOpen={onShowReactions} /> : null}
        {text ? <MessageAttachments text={text} /> : null}
        {timeOpen ? (
          <time
            data-bubble-time=""
            dateTime={message.createdAt}
            className="mt-1 px-1 text-11 text-zinc-500 dark:text-zinc-400 motion-safe:animate-[add-fade_160ms_ease-out_both]"
          >
            {exactTime(message.createdAt)}
          </time>
        ) : null}
        {sending ? (
          <span data-sending-label="" className="mt-1 px-1 text-11 text-zinc-500 dark:text-zinc-400">
            Sending…
          </span>
        ) : null}
        {seen ? (
          <span data-seen="" className="mt-1 px-1 text-11 font-semibold text-zinc-500 dark:text-zinc-400">
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
        mine ? "-right-[5px] text-[#7C3AED]" : "-left-[5px] -scale-x-100 text-zinc-200 dark:text-zinc-800"
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
      <p className="mt-3 text-17 font-semibold tracking-tight">
        {name}
        <TeamBadge username={username} className="ml-1 align-[-2px]" />
      </p>
      <p className="text-13 text-zinc-500 dark:text-zinc-400">@{username}</p>
      <p className="mt-4 max-w-[16rem] text-sm leading-5 text-zinc-500 dark:text-zinc-400">
        This is the start of your conversation. Say hi, ask about a card, or talk pickups.
      </p>
    </div>
  );
}
