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

  return {
    type(query: string) {
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
        options.onChange(suggestionState(q, snapshot));
      });
    },
    dispose() {
      generation += 1;
      session?.abort();
      session = null;
    },
  };
}
