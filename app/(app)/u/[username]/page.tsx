import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileView } from "@/components/profile-view";
import { ProfileSkeleton } from "@/components/status";
import { loadProfileBadges } from "@/lib/badges/load";
import { previewMetadata } from "@/lib/social/link-preview";
import { loadProfilePreview } from "@/lib/social/link-preview-load";
import { loadProfileCardCount } from "@/lib/social/profile-card-count";
import { requireProfile } from "@/lib/social/require-record";
import { getAuthUserId } from "@/lib/supabase/server";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return previewMetadata(await loadProfilePreview(username));
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  await requireProfile(username);
  const viewerId = await getAuthUserId();
  const [badges, cardCount] = await Promise.all([
    loadProfileBadges({ username }, viewerId),
    loadProfileCardCount({ username }, viewerId),
  ]);
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileView username={username} badges={badges} cardCount={cardCount} />
    </Suspense>
  );
}
