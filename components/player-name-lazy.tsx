"use client";

import { lazyPart } from "@/lib/ui/lazy-part";

type PlayerNameProps = {
  name: string;
  sport?: string | null;
  className?: string;
};

/** The name as plain text: the server's paint, and what shows until the link loads. */
function PlainPlayerName({ name, className }: PlayerNameProps) {
  return <span className={className}>{name}</span>;
}

/**
 * ResolvedPlayerName from its own chunk. The roster it resolves names against
 * (the card catalog and the directory) stays off the card page's first load.
 */
export const LazyResolvedPlayerName = lazyPart<PlayerNameProps>(
  () => import("@/components/resolved-player-name").then((mod) => mod.ResolvedPlayerName),
  PlainPlayerName,
);

/** PlayerNameLink from its own chunk, with its slug filter, off the first load. */
export const LazyPlayerNameLink = lazyPart<PlayerNameProps>(
  () => import("@/components/player-name-link").then((mod) => mod.PlayerNameLink),
  PlainPlayerName,
);
