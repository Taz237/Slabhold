"use client";

import { usePathname } from "next/navigation";
import { CollectionSkeleton, LoadingRows, ProfileSkeleton } from "@/components/status";

/**
 * Paints on tap while a profile route loads. The loading file sits on the
 * profile's folder, so it also covers the pages under it: each gets the
 * skeleton in its own shape.
 */
export function ProfileRouteLoading() {
  const pathname = usePathname() || "";
  if (/^\/(profile|u\/[^/]+)\/?$/.test(pathname)) return <ProfileSkeleton />;
  if (/\/collection\/?$/.test(pathname)) return <CollectionSkeleton />;
  return (
    <div className="-mx-4 -mt-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <LoadingRows count={5} />
    </div>
  );
}
