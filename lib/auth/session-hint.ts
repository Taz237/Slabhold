import { seedsViewer } from "./route-access";

/**
 * Before the social snapshot lands nobody knows who is signed in, and
 * Home's server HTML is the landing page. A tiny script in <head> tags
 * <html data-session> when a Supabase auth cookie is present, before the
 * first paint, so a signed-in reload never flashes the landing page while
 * signed-out visitors see it right away. A hint only: the snapshot decides.
 */
const SESSION_COOKIE = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/;

export function hasSessionCookie(cookie: string): boolean {
  return SESSION_COOKIE.test(cookie);
}

export const SESSION_HINT_SCRIPT = `try{if(${SESSION_COOKIE}.test(document.cookie))document.documentElement.dataset.session=""}catch(e){}`;

/** True when the head script saw a session cookie. Client only. */
export function sessionHinted(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.session !== undefined;
}

/**
 * Signed in, on a screen drawn from the browser: fetch the signed-in code
 * while the page hydrates. Screens the server already drew for this viewer
 * (see seedsViewer) don't need it for their first paint, so there it waits.
 */
export function preloadOnHint(): boolean {
  return sessionHinted() && !seedsViewer(window.location.pathname);
}
