import { after } from "next/server";
import { Dashboard } from "@/components/dashboard";
import { upsertTodaysCollectionSnapshot } from "@/lib/collection/totals";
import { leaderboardMinimums } from "@/lib/leaderboard/eligibility";
import { getAuthUser } from "@/lib/supabase/server";

export default async function CollectionPage() {
  const account = await getAuthUser();
  if (account) {
    after(() => {
      void upsertTodaysCollectionSnapshot(account.id).catch((err) => {
        console.warn(
          "[collection_snapshots]",
          err instanceof Error ? err.message : err,
        );
      });
    });
  }

  return (
    <Dashboard minimums={leaderboardMinimums()} accountCreatedAt={account?.createdAt ?? null} />
  );
}
