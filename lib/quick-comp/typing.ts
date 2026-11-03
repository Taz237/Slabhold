import type { CatalogCard } from "@/lib/card-catalog";
import {
  catalogSearchNeedsRetry,
  loadCatalogSearchSession,
  type CatalogSearchSnapshot,
} from "@/lib/catalog/catalog-search-session";

export type SuggestionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; query: string; results: CatalogCard[] }
  | { status: "miss"; query: string }
  | { status: "trouble"; query: string };

/** Suggestions start at two characters, so one letter never asks the catalog. */
export const SUGGEST_MIN_CHARS = 2;
export const SUGGESTION_LIMIT = 6;

export function suggestionState(query: string, snapshot: CatalogSearchSnapshot): SuggestionState {
  if (catalogSearchNeedsRetry(snapshot)) return { status: "trouble", query };
  if (snapshot.results.length === 0) return { status: "miss", query };
  return { status: "ready", query, results: snapshot.results.slice(0, SUGGESTION_LIMIT) };
}

/**
 * Catalog suggestions while typing. Each keystroke aborts the last session,
 * so a fast burst is one search_cards call after the 250ms pause. This only
 * reads the catalog: it never starts a sold-price lookup.
 */
export function createSuggestionTyping(options: {
  search: (query: string, signal: AbortSignal) => Promise<CatalogCard[] | null>;
  onChange: (state: SuggestionState) => void;
  debounceMs?: number;
}) {
  let session: { abort: () => void } | null = null;
  let generation = 0;
  /** An Enter waiting on this text's suggestions. Any new typing drops it. */
  let enter: { query: string; run: (results: CatalogCard[]) => void } | null = null;

  return {
    type(query: string) {
      enter = null;
      session?.abort();
      session = null;
      const id = ++generation;
      const q = query.trim();
      if (Array.from(q).length < SUGGEST_MIN_CHARS) {
        options.onChange({ status: "idle" });
        return;
      }
      options.onChange({ status: "loading" });
      const next = loadCatalogSearchSession({
        query: q,
        search: options.search,
        debounceMs: options.debounceMs,
        limit: 20,
      });
      session = next;
      void next.done.then((snapshot) => {
        if (snapshot.aborted || id !== generation) return;
        const state = suggestionState(q, snapshot);
        options.onChange(state);
        const waiting = enter;
        if (!waiting || waiting.query !== q) return;
        enter = null;
        if (state.status === "ready") waiting.run(state.results);
      });
    },
    /**
     * Run once when the suggestions for this text land ready. A miss or
     * trouble drops it, and so does any later type(), cancelEnter() or dispose().
     */
    whenReady(query: string, run: (results: CatalogCard[]) => void) {
      enter = { query: query.trim(), run };
    },
    cancelEnter() {
      enter = null;
    },
    dispose() {
      enter = null;
      generation += 1;
      session?.abort();
      session = null;
    },
  };
}
