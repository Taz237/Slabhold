"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import type { GifPickerProps } from "@/components/gif-picker";
import { GifMedia } from "@/components/post-gif";
import { useReducedMotion } from "@/components/timeline-ui";
import { GIF_ATTRIBUTION, gifLabel, sanitizeGif, type PostGif } from "@/lib/social/gifs";
import { useVisualViewport } from "@/lib/ui/use-keyboard-inset";

const SEARCH_FAILED = "Couldn't load GIFs. Try again.";
const DEBOUNCE_MS = 350;

type Page = { gifs: PostGif[]; nextOffset: number | null };
type Load =
  | { state: "loading" }
  | { state: "ready" }
  | { state: "more" }
  | { state: "error"; message: string };

/** One page from our own server route. The GIPHY key never reaches this file. */
export async function fetchGifPage(
  query: string,
  offset: number,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<Page> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (offset > 0) params.set("offset", String(offset));
  const search = params.toString();
  const response = await request(`/api/gifs/search${search ? `?${search}` : ""}`, { signal });
  const body = (await response.json().catch(() => null)) as
    | { gifs?: unknown; nextOffset?: unknown; error?: unknown }
    | null;
  if (!response.ok) {
    throw new Error(typeof body?.error === "string" && body.error ? body.error : SEARCH_FAILED);
  }
  const gifs = (Array.isArray(body?.gifs) ? body.gifs : [])
    .map((item) => sanitizeGif(item))
    .filter((gif): gif is PostGif => gif !== null);
  return { gifs, nextOffset: typeof body?.nextOffset === "number" ? body.nextOffset : null };
}

/** Two columns, each GIF in the shorter one, so the grid stays even. */
export function gifColumns(gifs: readonly PostGif[]): [PostGif[], PostGif[]] {
  const columns: [PostGif[], PostGif[]] = [[], []];
  const heights = [0, 0];
  for (const gif of gifs) {
    const side = heights[0]! <= heights[1]! ? 0 : 1;
    columns[side].push(gif);
    heights[side]! += gif.height / gif.width;
  }
  return columns;
}

export function GifPickerView({ onPick, onClose }: GifPickerProps) {
  const { frame } = useVisualViewport();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [opener] = useState(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  /** The answer to one search. `key` says which search and which try it answers. */
  const [result, setResult] = useState<{ key: string; gifs: PostGif[]; nextOffset: number | null; error: string | null }>({
    key: "",
    gifs: [],
    nextOffset: null,
    error: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const wanted = `${attempt}\n${search}`;
  const current = result.key === wanted;
  const gifs = current ? result.gifs : [];
  const nextOffset = current ? result.nextOffset : null;
  const load: Load = !current
    ? { state: "loading" }
    : result.error
      ? { state: "error", message: result.error }
      : loadingMore
        ? { state: "more" }
        : { state: "ready" };

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), query.trim() ? DEBOUNCE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    fetchGifPage(search, 0, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setResult({ key: wanted, gifs: page.gifs, nextOffset: page.nextOffset, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key: wanted,
          gifs: [],
          nextOffset: null,
          error: error instanceof Error ? error.message : SEARCH_FAILED,
        });
      });
    return () => controller.abort();
  }, [search, wanted]);

  function loadMore() {
    if (nextOffset === null || load.state !== "ready") return;
    setLoadingMore(true);
    fetchGifPage(search, nextOffset)
      .then((page) => {
        setResult((held) => {
          if (held.key !== wanted) return held;
          const seen = new Set(held.gifs.map((gif) => gif.id));
          return {
            ...held,
            gifs: [...held.gifs, ...page.gifs.filter((gif) => !seen.has(gif.id))],
            nextOffset: page.nextOffset,
          };
        });
      })
      .catch(() => {
        // What is on screen stays. The button is there to try again.
      })
      .finally(() => setLoadingMore(false));
  }

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Hand focus back to the button that opened the sheet.
  useLayoutEffect(
    () => () => {
      if (opener?.isConnected) opener.focus?.({ preventScroll: true });
    },
    [opener],
  );

  useEffect(() => {
    // Capture phase, so Escape closes only this sheet and not the composer under it.
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const columns = gifColumns(gifs);

  return createPortal(
    <div
      data-gif-picker=""
      className="fixed inset-x-0 top-0 z-[80] flex h-dvh items-end justify-center bg-black/50 md:items-center md:p-6"
      style={frame ? { top: frame.top, height: frame.height } : undefined}
      onClick={(event) => {
        // A portal still bubbles to the composer in React. Taps in here stay in here.
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a GIF"
        className="flex h-full w-full flex-col bg-white text-zinc-900 motion-safe:animate-[composer-in_220ms_cubic-bezier(0.2,0.7,0.2,1)_backwards] md:h-[36rem] md:max-h-full md:max-w-lg md:rounded-2xl md:shadow-2xl dark:bg-[#09090B] dark:text-zinc-100 md:dark:ring-1 md:dark:ring-white/10"
      >
        <div className="flex shrink-0 items-center gap-1 pt-[max(0.5rem,env(safe-area-inset-top))] pr-3 pb-1 pl-1">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close GIF search"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-zinc-700 active:bg-zinc-100 dark:text-zinc-300 dark:active:bg-white/5"
          >
            <X className="h-5 w-5" />
          </button>
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-zinc-100 px-4 focus-within:ring-2 focus-within:ring-violet-500 dark:bg-white/[0.06]">
            <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
            <span className="sr-only">Search GIFs</span>
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              maxLength={50}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // Enter searches. It must not send the post or reply under this sheet.
                if (event.key !== "Enter") return;
                event.preventDefault();
                setSearch(query.trim());
              }}
              placeholder="Search GIPHY"
              className="h-full min-w-0 flex-1 bg-transparent text-16 outline-none placeholder:text-zinc-500 [&::-webkit-search-cancel-button]:hidden"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-3" aria-busy={load.state === "loading"}>
          {load.state === "loading" ? (
            <GifSkeleton />
          ) : load.state === "error" ? (
            <div role="alert" className="flex flex-col items-center px-6 pt-16 text-center">
              <p className="text-15 text-zinc-600 dark:text-zinc-300">{load.message}</p>
              <button
                type="button"
                onClick={() => setAttempt((count) => count + 1)}
                className="mt-3 inline-flex min-h-11 items-center rounded-full px-4 text-15 font-semibold text-violet-700 active:bg-violet-500/10 dark:text-violet-300"
              >
                Try again
              </button>
            </div>
          ) : gifs.length === 0 ? (
            <div className="px-6 pt-16 text-center">
              <p className="text-15 font-semibold">No GIFs for &ldquo;{search}&rdquo;</p>
              <p className="mt-1 text-sm text-zinc-500">Try a shorter or different word.</p>
            </div>
          ) : (
            <>
              <p className="sr-only" role="status">
                {search ? `${gifs.length} GIFs for ${search}` : `${gifs.length} trending GIFs`}
              </p>
              <div className="flex gap-2">
                {columns.map((column, index) => (
                  <ul key={index} className="flex min-w-0 flex-1 flex-col gap-2">
                    {column.map((gif) => (
                      <li key={gif.id}>
                        <button
                          type="button"
                          data-gif-option=""
                          aria-label={`Use ${gifLabel(gif)}`}
                          onClick={() => onPick(gif)}
                          style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
                          className="block min-h-11 w-full overflow-hidden rounded-xl bg-zinc-100 transition-opacity active:opacity-70 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none dark:bg-white/[0.06]"
                        >
                          <GifMedia gif={gif} play={!reduceMotion} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
              {nextOffset !== null ? (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={load.state === "more"}
                  className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full text-15 font-semibold text-violet-700 active:bg-violet-500/10 disabled:opacity-60 dark:text-violet-300"
                >
                  {load.state === "more" ? "Loading…" : "Show more"}
                </button>
              ) : null}
            </>
          )}
        </div>

        <p className="shrink-0 border-t-[0.5px] border-zinc-300 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center font-mono text-11 text-zinc-500 dark:border-white/15">
          {GIF_ATTRIBUTION}
        </p>
      </div>
    </div>,
    document.body,
  );
}

const SKELETON_HEIGHTS = [
  [112, 160, 96, 136],
  [152, 104, 144, 100],
];

function GifSkeleton() {
  return (
    <div aria-hidden className="flex gap-2">
      {SKELETON_HEIGHTS.map((column, index) => (
        <div key={index} className="flex min-w-0 flex-1 flex-col gap-2">
          {column.map((height, row) => (
            <div key={row} className="skeleton-shimmer rounded-xl" style={{ height }} />
          ))}
        </div>
      ))}
    </div>
  );
}
