"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ProfileView } from "@/components/profile-view";
import { ProfileSkeleton } from "@/components/status";

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileView username={username} />
    </Suspense>
  );
}
