import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileView } from "@/components/profile-view";
import { ProfileSkeleton } from "@/components/status";
import { previewMetadata } from "@/lib/social/link-preview";
import { loadProfilePreview } from "@/lib/social/link-preview-load";
import { requireProfile } from "@/lib/social/require-record";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return previewMetadata(await loadProfilePreview(username));
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  await requireProfile(username);
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileView username={username} />
    </Suspense>
  );
}
