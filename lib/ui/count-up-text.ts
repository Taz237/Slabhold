/** A rounded step of the chip count-up: "+115%" at 0.5 reads "+58%". */
export function countUpText(pctText: string, progress: number): string {
  const match = /^([+−-]?)(\d+)%$/.exec(pctText);
  if (!match) return pctText;
  const t = Math.min(1, Math.max(0, progress));
  if (t >= 1) return pctText;
  const value = Math.round(Number(match[2]) * t);
  return value === 0 ? "0%" : `${match[1]}${value}%`;
}
