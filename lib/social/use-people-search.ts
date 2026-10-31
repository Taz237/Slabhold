"use client";

import { useEffect, useState } from "react";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import type { Profile } from "./types";

const DEBOUNCE_MS = 200;

/**
 * People whose handle or name matches `typed`, from a server search, never
 * the whole profiles table. Pass "" to search nothing. `pending` is true
 * between typing and the answer, so a screen doesn't flash "no matches".
 */
export function usePeopleSearch(typed: string): { people: Profile[]; pending: boolean } {
  const query = typed.trim();
  const [found, setFound] = useState<{ query: string; people: Profile[] } | null>(null);
  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void Promise.all([loadSupabaseBrowser(), import("./remote")])
        .then(([client, { searchPeople }]) => (client ? searchPeople(client, query.split(/\s+/)) : []))
        .then((people) => {
          if (!cancelled) setFound({ query, people });
        })
        .catch(() => {
          if (!cancelled) setFound({ query, people: [] });
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);
  if (!query) return { people: [], pending: false };
  const current = found?.query === query ? found : null;
  return { people: current?.people ?? [], pending: !current };
}
