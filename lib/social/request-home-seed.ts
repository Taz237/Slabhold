import "server-only";

import { requestViewer } from "@/lib/supabase/request-viewer";
import type { HomeSeed } from "./home-seed";
import { loadHomeSeed } from "./load-home-seed";

/**
 * Signed-in Home's first screen for this request, read per request and never
 * cached. Only a full page load needs it (see requestViewer).
 */
export async function requestHomeSeed(): Promise<HomeSeed | null> {
  const viewer = await requestViewer();
  if (!viewer) return null;
  return loadHomeSeed(viewer.supabase, { id: viewer.id, email: viewer.email });
}
