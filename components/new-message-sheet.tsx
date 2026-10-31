"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useSocial } from "@/components/social-provider";
import { hiddenFromSuggestions } from "@/lib/social/follow-rank";
import type { Profile } from "@/lib/social/types";
import { usePeopleSearch } from "@/lib/social/use-people-search";
import { userHref } from "@/lib/social/user-href";

/** Rows shown for a search, so a big profile list stays quick. */
const RESULT_LIMIT = 20;

/** People to message: who you follow, then suggested collectors. A search looks at everyone loaded. */
export function messageCandidates(input: {
  viewerId: string;
  profiles: readonly Profile[];
  followingIds: readonly string[];
  suggestions: readonly Profile[];
  blockedIds: readonly string[];
  query: string;
}): Profile[] {
  const blocked = new Set(input.blockedIds);
  const allowed = (profile: Profile) => profile.id !== input.viewerId && !blocked.has(profile.id);
  const needle = input.query.trim().toLowerCase().replace(/^@/, "");
  if (needle) {
    return input.profiles
      .filter(allowed)
      .filter((profile) => !hiddenFromSuggestions(profile))
      .filter(
        (profile) =>
          profile.displayName.toLowerCase().includes(needle) || profile.username.toLowerCase().includes(needle),
      )
      .slice(0, RESULT_LIMIT);
  }
  const byId = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const seen = new Set<string>();
  const out: Profile[] = [];
  for (const profile of [
    ...input.followingIds.map((id) => byId.get(id)),
    ...input.suggestions,
  ]) {
    if (!profile || seen.has(profile.id) || !allowed(profile)) continue;
    seen.add(profile.id);
    out.push(profile);
  }
  return out.slice(0, RESULT_LIMIT);
}

/** Pick someone to message. A bottom sheet on phones, a centered panel on desktop. */
export function NewMessageSheet({ onClose }: { onClose: () => void }) {
  const { user, mode, profiles, follows, suggestions, blockedIds } = useSocial();
  const [query, setQuery] = useState("");
  // Hosted: a search asks the server, never the whole profiles table.
  const search = usePeopleSearch(mode === "supabase" ? query : "");
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!user) return null;
  const people = messageCandidates({
    viewerId: user.id,
    profiles: query.trim() && mode === "supabase" ? search.people : profiles,
    followingIds: follows.filter((edge) => edge.followerId === user.id).map((edge) => edge.followingId),
    suggestions,
    blockedIds,
    query,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px] motion-safe:animate-[lightbox-fade_180ms_ease-out_both]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-[var(--background)] pb-[env(safe-area-inset-bottom)] shadow-2xl motion-safe:animate-[composer-in_260ms_cubic-bezier(0.2,0.7,0.2,1)_both] md:rounded-3xl dark:border-white/10"
      >
        <div className="flex items-center gap-2 px-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new message"
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 id={titleId} className="text-[17px] font-bold tracking-tight">
            New message
          </h2>
        </div>
        <label className="mx-4 mt-2 mb-2 flex min-h-11 items-center gap-2 rounded-full bg-zinc-200/60 px-4 focus-within:ring-2 focus-within:ring-violet-600 dark:bg-white/[0.07]">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search collectors"
            aria-label="Search collectors"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zinc-500"
          />
        </label>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
          {!query.trim() && people.length > 0 ? (
            <p className="px-4 pt-2 pb-1 font-mono text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
              Suggested
            </p>
          ) : null}
          {search.pending ? (
            <p className="px-6 py-10 text-center text-sm text-zinc-500" aria-live="polite">
              Searching…
            </p>
          ) : people.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-zinc-500">
              {query.trim() ? "No collectors match that." : "Follow a few collectors and they'll show up here."}
            </p>
          ) : (
            <ul>
              {people.map((person) => (
                <li key={person.id}>
                  <Link
                    href={userHref(person.username, "messages")}
                    onClick={onClose}
                    className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-white/[0.04]"
                  >
                    <Avatar
                      name={person.displayName}
                      image={person.avatarDataUrl}
                      accent={person.accent}
                      expandable={false}
                      className="h-10 w-10"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] leading-5 font-bold tracking-tight">
                        {person.displayName}
                      </span>
                      <span className="block truncate text-[13px] leading-5 text-zinc-500">@{person.username}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
