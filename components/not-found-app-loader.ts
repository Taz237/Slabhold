/**
 * The second step of the root 404's lazy load. The app shell spans many
 * chunks; naming them here, not in app-chrome-lazy, keeps that list off every
 * route's first load (signed-out Home included).
 */
export const loadNotFoundApp = () => import("@/components/not-found-app");
