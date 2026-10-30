import { Suspense } from "react";
import { after } from "next/server";
import { Dashboard } from "@/components/dashboard";
import { SeededViewer } from "@/components/viewer-seed";
import { loadCollectionSeed } from "@/lib/collection/load-viewer-seed";
import { upsertTodaysCollectionSnapshot } from "@/lib/collection/totals";
import { isRouterRequest } from "@/lib/supabase/router-request";
import { requestViewer } from "@/lib/supabase/request-viewer";
import { getAuthUserId } from "@/lib/supabase/server";

function saveTodaysSnapshot(userId: string | null) {
  if (!userId) return;
  after(() => {
    void upsertTodaysCollectionSnapshot(userId).catch((err) => {
      console.warn(
        "[collection_snapshots]",
        err instanceof Error ? err.message : err,
      );
    });
  });
}

/**
 * A full page load streams the viewer's collection, its values, and the
 * chart's history, read per request and never cached. A visit from inside
 * the app already has them in the browser and renders as before.
 */
export default async function CollectionPage() {
  if (await isRouterRequest()) {
    saveTodaysSnapshot(await getAuthUserId());
    return <Dashboard />;
  }
  return (
    <Suspense fallback={<Dashboard />}>
      <SeededCollection />
    </Suspense>
  );
}

async function SeededCollection() {
  const viewer = await requestViewer();
  saveTodaysSnapshot(viewer ? viewer.id : await getAuthUserId());
  const seed = viewer ? await loadCollectionSeed(viewer) : null;
  return (
    <SeededViewer seed={seed}>
      <Dashboard seed={seed} />
    </SeededViewer>
  );
}
