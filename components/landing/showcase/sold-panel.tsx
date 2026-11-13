import { SalesDots } from "@/components/scan/sales-dots";
import { money } from "@/lib/format";
import { COMP_COPY, summarizeSales, type ScanCompResult } from "@/lib/scan/comp";
import { SAMPLE_SCAN, SAMPLE_SCAN_SALES } from "./sample-data";

/** The sample sales through the scanner's own maths: the value, where most sold, and the dots. */
export const SAMPLE_SCAN_COMP = summarizeSales(SAMPLE_SCAN_SALES, { asOf: null, source: "quick-comp" }) as Extract<
  ScanCompResult,
  { status: "ok" }
>;

export function scanValue(): string {
  return money((SAMPLE_SCAN_COMP.medianCents ?? 0) / 100);
}

/**
 * The scan-to-comp sheet's value panel with the sample sales: the same lines
 * and copy (COMP_COPY) and the app's own dot chart, where every dot is one
 * sold sale. The app's panel lives inside the sheet and isn't exported, so
 * this follows its markup. `valueRef` lets the showcase count the value up.
 */
export function SoldPanel({ valueRef, className = "" }: { valueRef?: React.Ref<HTMLSpanElement>; className?: string }) {
  const comp = SAMPLE_SCAN_COMP;
  return (
    <div data-sold-panel="" className={`rounded-2xl border border-white/10 p-4 ${className}`}>
      <p className="text-[13px] font-medium text-zinc-400">
        {COMP_COPY.value} · {SAMPLE_SCAN.parallel}
      </p>
      <p className="mt-1 font-mono text-[28px] leading-9 font-semibold text-white tabular-nums">
        <span ref={valueRef}>{scanValue()}</span>
      </p>
      <p className="mt-1 text-sm text-zinc-400 tabular-nums">
        {comp.lowCents != null && comp.highCents != null
          ? `${COMP_COPY.range} ${money(comp.lowCents / 100)} and ${money(comp.highCents / 100)}`
          : null}
      </p>
      <SalesDots sales={comp.sales} medianCents={comp.medianCents} lowCents={comp.lowCents} highCents={comp.highCents} />
      <p className="mt-3 text-xs text-zinc-400">
        {comp.nSales} sample sales · {COMP_COPY.credit}
      </p>
    </div>
  );
}
