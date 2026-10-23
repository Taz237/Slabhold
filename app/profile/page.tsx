import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileView } from "@/components/profile-view";
import { ProfileSkeleton } from "@/components/status";
import { previewMetadata } from "@/lib/social/link-preview";
import { loadOwnProfilePreview } from "@/lib/social/link-preview-load";

export async function generateMetadata(): Promise<Metadata> {
  return previewMetadata(await loadOwnProfilePreview());
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileView />
    </Suspense>
  );
}
