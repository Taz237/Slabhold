import { formatDate, money } from "@/lib/format";
import { basedOnSalesLabel, type SaleBasis } from "@/lib/comps/shared-value";

/** "Based on N sales" plus the date, price, and grade of each sale in that count. */
export function CompBasis({
  count,
  basis,
}: {
  count: number;
  basis: SaleBasis[];
}) {
  if (count < 1) return null;
  return (
    <div className="mt-1">
      <p className="text-[11px] text-zinc-500">{basedOnSalesLabel(count)}</p>
      {basis.length > 0 ? (
        <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
          {basis.map((sale, index) => (
            <li
              key={`${sale.date}-${sale.price}-${sale.grade}-${index}`}
              className="text-[11px] tabular-nums text-zinc-500"
            >
              {formatDate(sale.date)} · {money(sale.price, true)} · {sale.grade}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
