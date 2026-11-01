"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CARD_CATALOG } from "@/lib/card-catalog";
import { prepareRosterIndex, resolvedPlayerHref, type PlayerRef } from "@/lib/players/slug";

let roster: PlayerRef[] | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/**
 * The directory's names and sports, then the catalog's, with the lookup index
 * built a slice at a time. It skips the name search's index, which this link
 * never reads, so no single task blocks the page.
 */
function loadRoster(): Promise<void> {
  loading ??= import("@/lib/players/directory.json")
    .then(async (mod) => {
      const players = mod.default as { name: string; sport: string }[];
      const next: PlayerRef[] = [
        ...players.map((player) => ({ name: player.name, sport: player.sport })),
        ...CARD_CATALOG.map((card) => ({ name: card.playerName, sport: card.sport })),
      ];
      await prepareRosterIndex(next);
      roster = next;
      for (const listener of listeners) listener();
    })
    .catch(() => {
      // Plain text stays. The next name on screen tries again.
      loading = null;
    });
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void loadRoster();
  return () => {
    listeners.delete(listener);
  };
}

function getRoster() {
  return roster;
}

function getServerRoster() {
  return null;
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
  const ready = useSyncExternalStore(subscribe, getRoster, getServerRoster);
  const href = ready ? resolvedPlayerHref(name, sport, ready) : null;
  if (!href) return <span className={className}>{name}</span>;
  return (
    <Link href={href} className={className} onClick={onClick}>
      {name}
    </Link>
  );
}
