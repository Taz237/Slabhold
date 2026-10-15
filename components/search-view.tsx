"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { CardThumb } from "@/components/card-thumb";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { outlineButton } from "@/components/button-styles";
import { EmptyState, LoadingRows } from "@/components/status";
import { cardSubtitle, cardTitle } from "@/lib/format";
import type { SportsCard } from "@/lib/types";

function cardSearchText(card: SportsCard) {
  return [card.playerName, String(card.year), card.setBrand, card.grade].join(" ").toLowerCase();
}

export function SearchView() {
  const { ready: socialReady, profiles, user } = useSocial();
  const { ready: cardsReady, cards } = useCollection();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const people = useMemo(() => {
    if (!q) return [];
    return profiles.filter(
      (profile) =>
        profile.username.toLowerCase().includes(q) ||
        profile.displayName.toLowerCase().includes(q),
    );
  }, [profiles, q]);

  const matchedCards = useMemo(() => {
    if (!q) return [];
    return cards.filter((card) => cardSearchText(card).includes(q));
  }, [cards, q]);

  if (!socialReady || !cardsReady) {
    return (
      <div className="-mx-4 -mt-5">
        <LoadingRows />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Search</h1>
      <label className="mt-4 flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
        <Search className="h-4 w-4 shrink-0 text-zinc-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          type="search"
          placeholder="Collectors, players, sets, grades"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zinc-500"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="grid h-6 w-6 place-items-center rounded-full text-zinc-500"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </label>

      {!q ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="Search Slabhold"
          detail="Find a collector or a card in your collection."
        />
      ) : people.length === 0 && matchedCards.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="No results"
          detail="Nothing matches that search. Try a name, @handle, player, or set."
        >
          <button type="button" onClick={() => setQuery("")} className={outlineButton}>
            Clear search
          </button>
        </EmptyState>
      ) : (
        <div className="mt-6 space-y-6">
          <section>
            <h2 className="text-[15px] font-bold">People</h2>
            {people.length === 0 ? (
              <EmptyState compact title="No matching collectors" detail="Try a name or @handle." />
            ) : (
              <ul className="mt-2 divide-y divide-zinc-200 dark:divide-white/10">
                {people.map((profile) => (
                  <li key={profile.id}>
                    <Link
                      href={user?.id === profile.id ? "/profile" : `/u/${profile.username}`}
                      className="flex items-center gap-3 py-3"
                    >
                      <Avatar
                        name={profile.displayName}
                        image={profile.avatarDataUrl}
                        accent={profile.accent}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-bold">
                          {profile.displayName}
                        </span>
                        <span className="block truncate text-sm text-zinc-500">
                          @{profile.username}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-[15px] font-bold">Cards</h2>
            {matchedCards.length === 0 ? (
              <EmptyState compact title="No matching cards" detail="Nothing in your collection matches that search." />
            ) : (
              <ul className="mt-2 divide-y divide-zinc-200 dark:divide-white/10">
                {matchedCards.map((card) => (
                  <li key={card.id}>
                    <Link href={`/cards/${card.id}`} className="flex items-center gap-3 py-3">
                      <CardThumb card={card} className="h-14 w-11 shrink-0 rounded-lg" />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-bold">
                          {card.playerName}
                        </span>
                        <span className="block truncate text-sm text-zinc-500">
                          {cardTitle(card)}
                        </span>
                        <span className="block truncate text-xs text-zinc-500">
                          {cardSubtitle(card)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
