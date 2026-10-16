"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { useSocial } from "@/components/social-provider";
import {
  activeMention,
  insertMention,
  rankMentionMatches,
  type MentionCandidate,
} from "@/lib/social/mentions";
import { searchProfilesForMention } from "@/lib/social/remote";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const DEBOUNCE_MS = 150;

function toCandidate(person: {
  id: string;
  username: string;
  displayName: string;
  avatarDataUrl: string | null;
  accent: string;
}): MentionCandidate {
  return {
    id: person.id,
    username: person.username,
    displayName: person.displayName,
    avatarDataUrl: person.avatarDataUrl,
    accent: person.accent,
  };
}

export function MentionTextarea({
  value,
  onChange,
  maxLength,
  rows = 3,
  autoFocus = false,
  placeholder,
  className,
  id,
  menu = "inline",
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  rows?: number;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  /** `docked` pins the list above the compose toolbar so it stays reachable on a phone. */
  menu?: "inline" | "docked";
}) {
  const { user, mode, profiles, followingOf } = useSocial();
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [cursor, setCursor] = useState(0);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [trackedQuery, setTrackedQuery] = useState("");
  const [pendingCaret, setPendingCaret] = useState<{ id: number; caret: number } | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [remotePeople, setRemotePeople] = useState<MentionCandidate[] | null>(null);

  const mention = activeMention(value, cursor);
  const queryKey = mention ? `${mention.start}:${mention.query}` : "";
  const open = Boolean(mention) && dismissedKey !== queryKey;
  const query = mention?.query ?? "";

  useEffect(() => {
    if (!mention) {
      setDebouncedQuery("");
      return;
    }
    const handle = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [mention, query]);

  const followingIds = useMemo(() => {
    if (!user) return new Set<string>();
    return new Set(followingOf(user.id).map((person) => person.id));
  }, [followingOf, user]);

  const localPeople = useMemo(() => {
    if (!user) return [] as MentionCandidate[];
    return profiles
      .filter((person) => person.id !== user.id)
      .map(toCandidate);
  }, [profiles, user]);

  useEffect(() => {
    if (!open || mode !== "supabase") {
      setRemotePeople(null);
      return;
    }
    let cancelled = false;
    const client = createSupabaseBrowser();
    if (!client) {
      setRemotePeople(null);
      return;
    }
    searchProfilesForMention(client, debouncedQuery)
      .then((rows) => {
        if (cancelled) return;
        setRemotePeople(rows.filter((person) => person.id !== user?.id));
      })
      .catch(() => {
        if (!cancelled) setRemotePeople(null);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, mode, open, user?.id]);

  const pool = remotePeople ?? localPeople;
  const matches = useMemo(
    () => rankMentionMatches(pool, debouncedQuery, followingIds, 8),
    [debouncedQuery, followingIds, pool],
  );

  if (debouncedQuery !== trackedQuery) {
    setTrackedQuery(debouncedQuery);
    setActive(0);
  }
  const highlighted = debouncedQuery === trackedQuery ? active : 0;
  const index = matches.length === 0 ? 0 : Math.min(highlighted, matches.length - 1);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[index]?.scrollIntoView({ block: "nearest" });
  }, [index, open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setDismissedKey(queryKey);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, queryKey]);

  function choose(person: MentionCandidate) {
    if (!mention) return;
    const next = insertMention(value, mention, person.username, maxLength);
    onChange(next.body);
    setCursor(next.caret);
    setDismissedKey(null);
    setPendingCaret((current) => ({ id: (current?.id ?? 0) + 1, caret: next.caret }));
  }

  useEffect(() => {
    if (!pendingCaret) return;
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(pendingCaret.caret, pendingCaret.caret);
  }, [pendingCaret]);

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (event.key === "ArrowDown" && matches.length > 0) {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, matches.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && matches.length > 0) {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && matches[index]) {
      event.preventDefault();
      choose(matches[index]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setDismissedKey(queryKey);
    }
  }

  const menuPanel = open ? (
    <div
      id="mention-list"
      role="listbox"
      aria-label="People you can mention"
      className={`overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200 bg-[var(--background)] shadow-lg dark:border-white/10 ${
        menu === "docked"
          ? "max-h-[min(18rem,42svh)]"
          : "mt-2 max-h-60"
      }`}
    >
      <p className="sticky top-0 bg-[var(--background)] px-3 pt-2.5 pb-1 text-xs font-medium text-zinc-500">
        Tag someone
      </p>
      {matches.length === 0 ? (
        <p className="px-3 pt-1 pb-3 text-sm text-zinc-500">No matches.</p>
      ) : (
        matches.map((person, optionIndex) => (
          <button
            key={person.id}
            ref={(node) => {
              optionRefs.current[optionIndex] = node;
            }}
            type="button"
            role="option"
            aria-selected={optionIndex === index}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(person)}
            className={`flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left touch-manipulation ${
              optionIndex === index
                ? "bg-violet-50 dark:bg-violet-500/15"
                : "active:bg-zinc-100 dark:active:bg-white/10"
            }`}
          >
            <Avatar
              name={person.displayName}
              image={person.avatarDataUrl}
              accent={person.accent}
              className="h-9 w-9 shrink-0"
              expandable={false}
            />
            <span className="min-w-0">
              <span className="block truncate text-[15px] leading-5 font-bold">
                {person.displayName}
              </span>
              <span className="block truncate text-sm text-zinc-500">@{person.username}</span>
            </span>
          </button>
        ))
      )}
    </div>
  ) : null;

  return (
    <div ref={rootRef}>
      <textarea
        ref={fieldRef}
        id={id}
        value={value}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        onChange={(event) => {
          const next = event.target.value.slice(0, maxLength);
          onChange(next);
          setCursor(event.target.selectionStart ?? next.length);
          setDismissedKey(null);
        }}
        onClick={(event) => setCursor(event.currentTarget.selectionStart ?? 0)}
        onKeyUp={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter") return;
          setCursor(event.currentTarget.selectionStart ?? 0);
        }}
        onKeyDown={onKeyDown}
        onSelect={(event) => setCursor(event.currentTarget.selectionStart ?? 0)}
        className={className}
      />
      {menu === "docked" && menuPanel ? (
        <div className="fixed inset-x-0 bottom-[calc(9.75rem+env(safe-area-inset-bottom))] z-40 mx-auto w-full max-w-lg px-3">
          {menuPanel}
        </div>
      ) : (
        menuPanel
      )}
    </div>
  );
}
