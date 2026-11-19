import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileView } from "@/components/profile-view";
import { ProfileSkeleton } from "@/components/status";
import { previewMetadata } from "@/lib/social/link-preview";
import { loadOwnProfilePreview } from "@/lib/social/link-preview-load";
import { loadProfileCardCount } from "@/lib/social/profile-card-count";
import { getAuthUserId } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return previewMetadata(await loadOwnProfilePreview());
}

export default async function ProfilePage() {
  const viewerId = await getAuthUserId();
  // Badges are still earned, but the profile no longer shows them, so it no longer reads them.
  const cardCount = await loadProfileCardCount({ own: true }, viewerId);
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileView cardCount={cardCount} />
    </Suspense>
  );
}
