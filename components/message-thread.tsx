"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { solidButton } from "@/components/button-styles";
import { CardMessagePreviewCard } from "@/components/open-to-offers";
import { EmptyState, LoadingRows } from "@/components/status";
import { useSocial } from "@/components/social-provider";
import { signupPath } from "@/lib/auth/safe-next";
import { exactTime, timeAgo } from "@/lib/format";
import { offerCardForThread } from "@/lib/offers/open-to-offers";
import { MESSAGE_LIMIT } from "@/lib/social/types";

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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [thread.length, partner?.id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !partner) return;
    if (!user) {
      router.push(signupPath(pathname));
      return;
    }
    setPending(true);
    const result = await sendMessage(partner.id, draft, offerAttachment);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft("");
    setError(null);
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

  return (
    <div className="-mx-4 -mt-5 -mb-28 flex h-[calc(100dvh-3.5rem-6.15rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-2 py-2 dark:border-white/10">
        <button
          type="button"
          onClick={() => router.push("/messages")}
          aria-label="Back to messages"
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Link href={`/u/${partner.username}`} className="flex min-w-0 flex-1 items-center gap-2">
          <Avatar
            name={partner.displayName}
            image={partner.avatarDataUrl}
            accent={partner.accent}
            className="h-8 w-8"
          />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold leading-5">{partner.displayName}</span>
            <span className="block truncate text-xs text-zinc-500">@{partner.username}</span>
          </span>
        </Link>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {thread.length === 0 ? (
          <p className="px-6 pt-10 text-center text-sm text-zinc-500">
            This is the start of your conversation with {partner.displayName}.
          </p>
        ) : (
          thread.map((message) => {
            const mine = message.senderId === user.id;
            const stamp = timeAgo(message.createdAt);
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                  {message.cardPreview ? (
                    <CardMessagePreviewCard preview={message.cardPreview} />
                  ) : null}
                  {message.content.trim() ? (
                    <p
                      className={`rounded-2xl px-3 py-2 text-[15px] leading-5 whitespace-pre-wrap ${
                        mine
                          ? "rounded-br-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                          : "rounded-bl-md bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-zinc-100"
                      }`}
                    >
                      {message.content}
                    </p>
                  ) : null}
                  {stamp ? (
                    <time
                      dateTime={message.createdAt}
                      title={exactTime(message.createdAt)}
                      className="mt-1 px-1 text-[11px] text-zinc-500"
                    >
                      {stamp}
                    </time>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-zinc-200 px-3 py-2 dark:border-white/10">
        {error ? <p className="mb-1 text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
        {offerAttachment ? (
          <div className="mb-2 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <CardMessagePreviewCard preview={offerAttachment} />
            </div>
            <button
              type="button"
              aria-label="Remove card"
              onClick={() => router.replace(`/messages/${partner.username}`)}
              className="mt-2 grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value.slice(0, MESSAGE_LIMIT));
              const field = event.target;
              field.style.height = "auto";
              field.style.height = `${Math.min(field.scrollHeight, 128)}px`;
            }}
            rows={1}
            placeholder="Start a message"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[15px] leading-5 outline-none placeholder:text-zinc-500 dark:border-white/10 dark:bg-white/10"
          />
          <button
            type="submit"
            disabled={pending || (!draft.trim() && !offerAttachment)}
            className={`${solidButton} mb-0.5`}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
