import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileView } from "@/components/profile-view";
import { ProfileSkeleton } from "@/components/status";
import { loadProfileBadges } from "@/lib/badges/load";
import { previewMetadata } from "@/lib/social/link-preview";
import { loadOwnProfilePreview } from "@/lib/social/link-preview-load";
import { loadProfileCardCount } from "@/lib/social/profile-card-count";
import { getAuthUserId } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return previewMetadata(await loadOwnProfilePreview());
}

export default async function ProfilePage() {
  const viewerId = await getAuthUserId();
  const [badges, cardCount] = await Promise.all([
    loadProfileBadges({ own: true }, viewerId),
    loadProfileCardCount({ own: true }, viewerId),
  ]);
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileView badges={badges} cardCount={cardCount} />
    </Suspense>
  );
}
