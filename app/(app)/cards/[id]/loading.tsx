"use client";

import { usePathname } from "next/navigation";
import { CardDetailPending } from "@/components/card-detail-shell";

export default function CardLoading() {
  const pathname = usePathname() || "";
  if (/^\/cards\/[^/]+\/(edit|posts)\/?$/.test(pathname)) {
    return (
      <div
        className="h-64 skeleton-shimmer rounded-2xl"
        aria-busy="true"
      />
    );
  }
  return <CardDetailPending />;
}
