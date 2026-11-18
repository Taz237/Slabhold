import { ProfileRouteLoading } from "@/components/profile-route-loading";

/** Paints on tap while the profile loads: the ProfileSkeleton the page shows next, so nothing moves. */
export default function ProfileLoading() {
  return <ProfileRouteLoading />;
}
