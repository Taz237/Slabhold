import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileView } from "@/components/profile-view";
import { ProfileSkeleton } from "@/components/status";
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
  // The profile check and the session check don't depend on each other.
  const [, viewerId] = await Promise.all([requireProfile(username), getAuthUserId()]);
  // Badges are still earned, but the profile no longer shows them, so it no longer reads them.
  const cardCount = await loadProfileCardCount({ username }, viewerId);
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileView username={username} cardCount={cardCount} />
    </Suspense>
  );
}
