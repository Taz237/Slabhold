import { Suspense } from "react";
import { ProfileView } from "@/components/profile-view";
import { ProfileSkeleton } from "@/components/status";

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileView />
    </Suspense>
  );
}
