export type ValuePoint = {
  date: string;
  label: string;
  value: number;
};

function hash(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mockValueHistory(card: {
  id: string;
  estimatedSellPrice: number;
  purchasePrice: number;
}): ValuePoint[] {
  const current = Math.max(1, Math.round(card.estimatedSellPrice || card.purchasePrice || 100));
  const rand = mulberry32(hash(card.id || card.purchasePrice.toString()));
  const count = 8 + Math.floor(rand() * 5);
  const spanDays = 150 + Math.floor(rand() * 30);
  let value = current * (0.7 + rand() * 0.22);
  const points: ValuePoint[] = [];

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const daysAgo = Math.round(spanDays * (1 - t));
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - daysAgo);
    if (i === count - 1) {
      value = current;
    } else {
      const remaining = count - 1 - i;
      const drift = (current - value) / remaining;
      const noise = (rand() - 0.45) * current * 0.045;
      value = Math.max(current * 0.5, value + drift * 0.55 + noise);
    }
    points.push({
      date: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: i === count - 1 ? current : Math.round(value),
    });
  }

  return points;
}
