"use client";

import { Analytics } from "@vercel/analytics/next";
import { scrubAnalyticsUrl } from "@/lib/analytics";

export function WebAnalytics() {
  return <Analytics beforeSend={scrubAnalyticsUrl} />;
}
