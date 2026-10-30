import "server-only";

import { headers } from "next/headers";
import { isRouterNavigation } from "./router-nav";

/** True when the app's router asked for the page (a visit from inside the app), not a full page load. */
export async function isRouterRequest(): Promise<boolean> {
  return isRouterNavigation(await headers());
}
