"use client";

import { usePathname } from "next/navigation";
import { CardDetailPending } from "@/components/card-detail-shell";

export default function CardLoading() {
  const pathname = usePathname() || "";
  if (/^\/cards\/[^/]+\/(edit|posts)\/?$/.test(pathname)) {
    return (
      <div
        className="h-64 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5"
        aria-busy="true"
      />
    );
  }
  return <CardDetailPending />;
}
