import { signedMoney } from "@/lib/format";

export function ProfitText({
  value,
  exact = false,
  className = "",
}: {
  value: number;
  exact?: boolean;
  className?: string;
}) {
  const tone =
    value > 0 ? "text-emerald-400" : value < 0 ? "text-rose-400" : "text-zinc-400";
  return (
    <span className={`tabular-nums ${tone} ${className}`}>
      {signedMoney(value, exact)}
    </span>
  );
}
