import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileView } from "@/components/profile-view";
import { ProfileSkeleton } from "@/components/status";
import { leaderboardChipsFor } from "@/lib/leaderboard/load";
import { previewMetadata } from "@/lib/social/link-preview";
import { loadOwnProfilePreview } from "@/lib/social/link-preview-load";
import { getAuthUserId } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return previewMetadata(await loadOwnProfilePreview());
}

export default async function ProfilePage() {
  const userId = await getAuthUserId();
  const badges = await leaderboardChipsFor({ userId });
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileView badges={badges} />
    </Suspense>
  );
}
