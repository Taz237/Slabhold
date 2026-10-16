import { after } from "next/server";
import { Dashboard } from "@/components/dashboard";
import { upsertTodaysCollectionSnapshot } from "@/lib/collection/totals";
import { getAuthUserId } from "@/lib/supabase/server";

export default async function CollectionPage() {
  const userId = await getAuthUserId();
  if (userId) {
    after(() => {
      void upsertTodaysCollectionSnapshot(userId).catch((err) => {
        console.warn(
          "[collection_snapshots]",
          err instanceof Error ? err.message : err,
        );
      });
    });
  }

  return <Dashboard />;
}
