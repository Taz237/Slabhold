"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import { SpeedInsights as VercelSpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { routePattern, scrubAnalyticsUrl } from "@/lib/analytics";

// The Next wrappers compute a route, then spread props over it. These casts
// let us pass the scrubbed pattern, which replaces that computed route.
const Analytics = VercelAnalytics as (
  props: ComponentProps<typeof VercelAnalytics> & { route: string; path: string },
) => null;

const SpeedInsights = VercelSpeedInsights as (
  props: ComponentProps<typeof VercelSpeedInsights> & { route: string },
) => null;

export function WebAnalytics() {
  const pattern = routePattern(usePathname());
  return (
    <>
      <Analytics route={pattern} path={pattern} beforeSend={scrubAnalyticsUrl} />
      <SpeedInsights
        route={pattern}
        beforeSend={(e) => {
          const url = scrubAnalyticsUrl({ type: "pageview", url: e.url })?.url;
          return url ? { ...e, url } : null;
        }}
      />
    </>
  );
}
