"use client";

import { useEffect, useState } from "react";
import { afterFirstIdle } from "@/lib/ui/idle";
import { lazyPart } from "@/lib/ui/lazy-part";

const Scripts = lazyPart(() => import("@/components/web-analytics").then((mod) => mod.WebAnalytics));

/**
 * Vercel Web Analytics and Speed Insights, deferred: their code and scripts
 * load after the first idle moment, so they never compete with the first
 * paint. Speed Insights still reads that paint's vitals (buffered entries).
 */
export function WebAnalytics() {
  const [idle, setIdle] = useState(false);
  useEffect(() => afterFirstIdle(() => setIdle(true)), []);
  return idle ? <Scripts /> : null;
}
