"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { sessionHinted } from "@/lib/auth/session-hint";
import { isStandaloneApp } from "@/lib/pwa/add-to-home";
import { getSupabaseConfig } from "@/lib/supabase/client";

/**
 * When the app-wide state (social snapshot, collection, and with them
 * supabase-js) starts. A visitor on signed-out Home never needs it: the
 * landing page is static, and no session cookie means nobody is signed in. So
 * there it waits until they leave Home. Everywhere else it starts while the
 * page hydrates, as it does on Home whenever a session cookie says someone is
 * signed in, in the installed app (its Home sends a signed-out reader to log
 * in), and with local accounts (no Supabase keys), which keep their session in
 * storage.
 */
export function engineFirst(pathname?: string): boolean {
  if (typeof window === "undefined") return false;
  if ((pathname ?? window.location.pathname) !== "/") return true;
  if (sessionHinted() || !getSupabaseConfig().configured) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return isStandaloneApp({
    navigatorStandalone: nav.standalone === true,
    displayModeStandalone: Boolean(window.matchMedia?.("(display-mode: standalone)").matches),
  });
}

// Once started, it stays started for the life of the page. Decided when this
// module loads, before hydration, so a page that needs the state mounts it
// during hydration, as the providers always did. The engines draw no DOM, so
// starting them there never mismatches the server HTML. False on the server.
let started = engineFirst();
const listeners = new Set<() => void>();

export function startEngines() {
  if (started) return;
  started = true;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (engineFirst()) startEngines();
  return () => {
    listeners.delete(listener);
  };
}

/** False on the server; true once the state should load. */
export function useEngineStart(): boolean {
  const pathname = usePathname();
  const start = useSyncExternalStore(
    subscribe,
    () => started,
    () => started,
  );
  // Leaving Home (to log in, sign up, or any page) starts it.
  useEffect(() => {
    if (engineFirst(pathname ?? undefined)) startEngines();
  }, [pathname]);
  return start;
}
