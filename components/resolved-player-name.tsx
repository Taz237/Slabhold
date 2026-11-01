"use client";

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import type { PlayerLinkReply, PlayerLinkRequest } from "@/lib/players/player-link-roster";
import type { PlayerRef } from "@/lib/players/slug";

/** Resolved links by name and sport. A name in here links on its first render. */
const hrefs = new Map<string, string | null>();
/** Asked and not answered yet. */
const pending = new Map<string, PlayerLinkRequest>();
const listeners = new Set<() => void>();

/** undefined: not started yet. null: no worker here, so the main thread resolves. */
let worker: Worker | null | undefined;
let queued: PlayerLinkRequest[] = [];
let flushScheduled = false;
let mainRoster: Promise<PlayerRef[]> | null = null;

function linkKey(name: string, sport: string | null): string {
  return `${sport ?? ""}\u0000${name}`;
}

function answer(replies: readonly PlayerLinkReply[]) {
  for (const { key, href } of replies) {
    if (!pending.has(key)) continue;
    pending.delete(key);
    hrefs.set(key, href);
  }
  for (const listener of listeners) listener();
}

/**
 * Same roster and index, built a slice at a time on the main thread. Used
 * where a worker can't start. A failed load leaves plain text; the next
 * name on screen tries again.
 */
function resolveOnMainThread(requests: PlayerLinkRequest[]) {
  mainRoster ??= import("@/lib/players/player-link-roster").then((mod) => mod.loadLinkRosterInSlices());
  void Promise.all([mainRoster, import("@/lib/players/player-link-roster")]).then(
    ([roster, mod]) => answer(mod.answerPlayerLinks(requests, roster)),
    () => {
      mainRoster = null;
      for (const request of requests) pending.delete(request.key);
    },
  );
}

function startWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === "undefined") return null;
  try {
    const next = new Worker(new URL("../lib/players/player-link-worker.ts", import.meta.url), { type: "module" });
    next.onmessage = (event: MessageEvent<PlayerLinkReply[]>) => answer(event.data);
    next.onerror = () => {
      // The worker couldn't load: everything it still owes resolves here.
      next.terminate();
      worker = null;
      const owed = [...pending.values()];
      if (owed.length) resolveOnMainThread(owed);
    };
    worker = next;
  } catch {
    worker = null;
  }
  return worker;
}

/** Names asked in the same render go out as one message. */
function flush() {
  flushScheduled = false;
  const requests = queued;
  queued = [];
  if (!requests.length) return;
  const target = startWorker();
  if (target) target.postMessage(requests);
  else resolveOnMainThread(requests);
}

function ask(name: string, sport: string | null) {
  const key = linkKey(name, sport);
  if (hrefs.has(key) || pending.has(key)) return;
  const request = { key, name, sport };
  pending.set(key, request);
  queued.push(request);
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flush);
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
  const sportKey = sport ?? null;
  const key = linkKey(name, sportKey);
  const subscribe = useCallback(
    (listener: () => void) => {
      listeners.add(listener);
      ask(name, sportKey);
      return () => {
        listeners.delete(listener);
      };
    },
    [name, sportKey],
  );
  const href = useSyncExternalStore(
    subscribe,
    () => hrefs.get(key) ?? null,
    () => null,
  );
  if (!href) return <span className={className}>{name}</span>;
  return (
    <Link href={href} className={className} onClick={onClick}>
      {name}
    </Link>
  );
}
