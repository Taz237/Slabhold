"use client";

import Link from "next/link";
import { centsToDollars } from "@/lib/comps/stats";
import {
  publicCompsVerdict,
  type PublicCardComps,
} from "@/lib/comps/public-types";
import { trackEvent, type AnalyticsSender } from "@/lib/analytics";
import { signupPath } from "@/lib/auth/safe-next";
import { formatDate, money } from "@/lib/format";

/** Signup from the public comps preview. Props stay on the scrubbed allowlist path. */
export function trackPublicCompsCta(send?: AnalyticsSender): void {
  trackEvent("signup_started", { source: "card_comps" }, send);
}

export function PublicCardCompsPreview({
  comps,
  pathname,
}: {
  comps: PublicCardComps;
  pathname: string;
}) {
  const verdict = publicCompsVerdict(comps);
  if (verdict.kind === "hidden") return null;

  const sales = verdict.kind === "sample" ? [] : comps.sales;
  const href = signupPath(pathname);

  return (
    <div className="mt-3">
      {sales.length > 0 ? (
        <ul className="divide-y divide-zinc-200 dark:divide-white/10">
          {sales.map((sale) => (
            <li
              key={`${sale.soldAt}-${sale.priceCents}-${sale.grade}`}
              className="flex items-start justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-zinc-800 dark:text-zinc-100">{sale.grade}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  <span className="tabular-nums">{formatDate(sale.soldAt)}</span>
                  {sale.source ? ` · ${sale.source}` : null}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums whitespace-nowrap">
                {money(centsToDollars(sale.priceCents))}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {verdict.kind === "sample" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {verdict.label}
        </p>
      ) : null}

      {verdict.kind === "range" ? (
        <div className="mt-3 space-y-1">
          <p className="text-sm font-semibold">{verdict.fair}</p>
          <p className="text-sm text-zinc-700 dark:text-zinc-200">{verdict.typical}</p>
          <p className="text-xs text-zinc-500">{verdict.basis}</p>
        </div>
      ) : null}

      {verdict.kind === "insufficient" ? (
        <p className="text-sm text-zinc-500">{verdict.label}</p>
      ) : null}

      {verdict.kind === "range" ? (
        <p className="mt-3 text-[11px] text-zinc-400">{verdict.credit}</p>
      ) : null}
      {verdict.kind === "insufficient" && verdict.credit ? (
        <p className="mt-3 text-[11px] text-zinc-400">{verdict.credit}</p>
      ) : null}

      <Link
        href={href}
        onClick={() => trackPublicCompsCta()}
        className="mt-4 flex min-h-11 w-full items-center justify-center rounded-full bg-[#7C3AED] px-4 text-center text-sm font-bold text-white"
      >
        Sign up free to see full history, charts and alerts
      </Link>
    </div>
  );
}
