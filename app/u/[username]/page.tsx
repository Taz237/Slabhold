import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileView } from "@/components/profile-view";
import { ProfileSkeleton } from "@/components/status";
import { loadProfileBadges } from "@/lib/badges/load";
import { previewMetadata } from "@/lib/social/link-preview";
import { loadProfilePreview } from "@/lib/social/link-preview-load";
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
  const badges = await loadProfileBadges({ username }, await getAuthUserId());
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileView username={username} badges={badges} />
    </Suspense>
  );
}
