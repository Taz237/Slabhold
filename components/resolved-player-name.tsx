"use client";

import Link from "next/link";
import { CARD_CATALOG } from "@/lib/card-catalog";
import { usePlayerDirectory } from "@/lib/players/use-directory";
import { resolvedPlayerHref, type PlayerRef } from "@/lib/players/slug";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";

let rosterKey: readonly IndexedDirectoryPlayer[] | null = null;
let rosterValue: PlayerRef[] | null = null;

function linkRoster(players: readonly IndexedDirectoryPlayer[]): PlayerRef[] {
  if (rosterValue && rosterKey === players) return rosterValue;
  rosterValue = [
    ...players.map((player) => ({ name: player.name, sport: player.sport })),
    ...CARD_CATALOG.map((card) => ({ name: card.playerName, sport: card.sport })),
  ];
  rosterKey = players;
  return rosterValue;
}

/** /p link only after the directory resolves the name. Plain text until then, and for unknown names. */
export function ResolvedPlayerName({
  name,
  sport,
  className,
  onClick,
}: {
  name: string;
  sport?: string | null;
  className?: string;
  onClick?: () => void;
}) {
  const directory = usePlayerDirectory();
  const href =
    directory.status === "ready" ? resolvedPlayerHref(name, sport, linkRoster(directory.players)) : null;
  if (!href) return <span className={className}>{name}</span>;
  return (
    <Link href={href} className={className} onClick={onClick}>
      {name}
    </Link>
  );
}
