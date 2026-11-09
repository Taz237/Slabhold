"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Search, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useSocial } from "@/components/social-provider";
import { contentProblem } from "@/lib/safety/content-filter";
import {
  handleQuery,
  SEND_POST_RECIPIENT_LIMIT,
  sendPostCandidates,
  sharedPostMessage,
} from "@/lib/social/send-post";
import type { Post, Profile } from "@/lib/social/types";
import { useProfiles } from "@/lib/social/use-profiles";
import { userHref } from "@/lib/social/user-href";

/*
 * The Send sheet: recent DM partners, then a search over people you follow
 * and handles. Each tap sends the post to one person as a normal message.
 */

const NOTE_LIMIT = 280;

type RowState = { status: "sending" } | { status: "sent" } | { status: "failed"; error: string };

export function SendPostSheetView({ post, onClose }: { post: Post; onClose: () => void }) {
  const titleId = useId();
  const noteId = useId();
  const {
    user,
    messages,
    profiles,
    followingOf,
    blockedIds,
    safetyAccounts,
    sendMessage,
    profileByUsername,
  } = useSocial();
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [toast, setToast] = useState<{ username: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const handle = handleQuery(query);
  useProfiles(handle ? { usernames: [handle] } : null);
  const byHandle = handle ? profileByUsername(handle) : undefined;

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Capture phase, so Escape closes only this sheet and not one underneath it.
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCloseRef.current();
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const viewerId = user?.id ?? "";
  const following = useMemo(() => (viewerId ? followingOf(viewerId) : []), [followingOf, viewerId]);
  const { recent, others } = useMemo(
    () =>
      sendPostCandidates({
        viewerId,
        blockedIds,
        safetyAccounts,
        messages,
        profiles: byHandle ? [...profiles, byHandle] : profiles,
        following,
        query,
      }),
    [blockedIds, byHandle, following, messages, profiles, query, safetyAccounts, viewerId],
  );

  const noteProblem = contentProblem(note);
  const sentCount = Object.values(rows).filter((row) => row.status === "sent").length;
  const busy = Object.values(rows).some((row) => row.status === "sending");
  const full = sentCount >= SEND_POST_RECIPIENT_LIMIT;

  async function send(person: Profile) {
    if (busy || full || noteProblem || rows[person.id]?.status === "sent") return;
    setRows((current) => ({ ...current, [person.id]: { status: "sending" } }));
    const result = await sendMessage(person.id, sharedPostMessage(post.id, note));
    if (result.error) {
      setRows((current) => ({ ...current, [person.id]: { status: "failed", error: result.error ?? "" } }));
      return;
    }
    setRows((current) => ({ ...current, [person.id]: { status: "sent" } }));
    setToast({ username: person.username });
  }

  function row(person: Profile) {
    const state = rows[person.id];
    const sent = state?.status === "sent";
    const sending = state?.status === "sending";
    return (
      <li key={person.id} data-send-row={person.username}>
        <div className="flex min-h-14 items-center gap-3 rounded-2xl px-2 py-1.5">
          <Avatar
            name={person.displayName}
            image={person.avatarDataUrl}
            accent={person.accent}
            expandable={false}
            className="h-10 w-10"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold leading-5 tracking-tight">
              {person.displayName}
            </span>
            <span className="block truncate text-[13px] text-zinc-500">@{person.username}</span>
          </span>
          <button
            type="button"
            aria-label={sent ? `Sent to @${person.username}` : `Send to @${person.username}`}
            disabled={sent || busy || (full && !sent) || Boolean(noteProblem)}
            onClick={() => void send(person)}
            className={`inline-flex min-h-11 min-w-[4.75rem] shrink-0 items-center justify-center gap-1 rounded-full px-4 text-sm font-semibold transition-[transform,opacity,background-color] duration-150 active:scale-95 motion-reduce:transition-none ${
              sent
                ? "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-200"
                : "bg-violet-600 text-white disabled:opacity-40"
            }`}
          >
            {sent ? <Check aria-hidden className="h-4 w-4" /> : null}
            {sent ? "Sent" : sending ? "Sending" : "Send"}
          </button>
        </div>
        {state?.status === "failed" ? (
          <p role="alert" className="px-2 pb-1 pl-[3.75rem] text-xs text-rose-600 dark:text-rose-400">
            {state.error}
          </p>
        ) : null}
      </li>
    );
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="backdrop-in fixed inset-0 z-[70] grid place-items-end bg-black/60 sm:place-items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-send-post-sheet=""
        onClick={(event) => event.stopPropagation()}
        className="sheet-up flex max-h-[85dvh] w-full max-w-sm flex-col rounded-t-3xl border-t border-zinc-200 bg-[var(--background)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-zinc-900 shadow-2xl sm:rounded-3xl sm:border dark:border-white/10 dark:text-zinc-100"
      >
        <div aria-hidden className="mx-auto mb-1 h-1 w-9 shrink-0 rounded-full bg-zinc-300 sm:hidden dark:bg-white/20" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-2 pt-1">
          <h2 id={titleId} className="text-base font-semibold tracking-tight">
            Send in a DM
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="relative mx-1 mt-1 block shrink-0">
          <span className="sr-only">Search people</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people you follow"
            autoComplete="off"
            className="min-h-11 w-full rounded-full border border-zinc-200 bg-zinc-50 pr-4 pl-10 text-[15px] outline-none placeholder:text-zinc-500 focus:border-violet-500/60 focus:ring-2 focus:ring-violet-600/20 dark:border-white/10 dark:bg-white/[0.06]"
          />
        </label>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {recent.length ? (
            <>
              <p className="px-3 pt-1 pb-0.5 text-[13px] font-medium text-zinc-500">Recent</p>
              <ul data-send-recent="">{recent.map(row)}</ul>
            </>
          ) : null}
          {others.length ? (
            <>
              <p className="px-3 pt-2 pb-0.5 text-[13px] font-medium text-zinc-500">
                {query.trim() ? "People" : "Following"}
              </p>
              <ul data-send-others="">{others.map(row)}</ul>
            </>
          ) : null}
          {!recent.length && !others.length ? (
            <p data-send-empty="" className="px-4 py-8 text-center text-sm leading-5 text-zinc-500">
              {query.trim()
                ? "No one by that name. Try their exact handle."
                : "Follow collectors or start a chat, and they'll show up here."}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 border-t border-zinc-200/80 px-1 pt-2 dark:border-white/[0.08]">
          <label htmlFor={noteId} className="sr-only">
            Add a note
          </label>
          <input
            id={noteId}
            value={note}
            maxLength={NOTE_LIMIT}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a note (optional)"
            autoComplete="off"
            className="min-h-11 w-full rounded-full border border-zinc-200 bg-transparent px-4 text-[15px] outline-none placeholder:text-zinc-500 focus:border-violet-500/60 focus:ring-2 focus:ring-violet-600/20 dark:border-white/10"
          />
          <p role="status" className="min-h-5 px-3 pt-1 text-xs text-zinc-500">
            {noteProblem
              ? noteProblem
              : full
                ? `You can send this to ${SEND_POST_RECIPIENT_LIMIT} people at a time.`
                : ""}
          </p>
        </div>
      </div>
      {toast ? (
        <p
          role="status"
          data-send-toast=""
          onClick={(event) => event.stopPropagation()}
          className="fixed top-[max(1rem,env(safe-area-inset-top))] left-1/2 z-[71] flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900 py-1 pr-1 pl-4 text-sm font-semibold text-white shadow-lg motion-safe:animate-[pill-in_260ms_cubic-bezier(0.2,0.7,0.2,1)_both] dark:bg-zinc-100 dark:text-zinc-950"
        >
          Sent
          <Link
            href={userHref(toast.username, "messages")}
            className="inline-flex min-h-9 items-center rounded-full bg-white/15 px-3 dark:bg-zinc-950/10"
          >
            View
          </Link>
        </p>
      ) : null}
    </div>,
    document.body,
  );
}
