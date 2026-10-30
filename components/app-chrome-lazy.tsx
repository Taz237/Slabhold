"use client";

import { Suspense, lazy } from "react";

const NotFoundApp = lazy(() => import("@/components/not-found-app").then((mod) => ({ default: mod.NotFoundApp })));

/**
 * The root 404 (a link that matches no page) inside the app's shell. Drawn on
 * the server as before, but its code is its own chunk, so the root not-found
 * doesn't put the app in every route's first load (signed-out Home included).
 */
export function NotFoundInApp() {
  return (
    <Suspense>
      <NotFoundApp />
    </Suspense>
  );
}
