export const MOVING_SPORTS = [
  { id: "baseball", label: "Baseball" },
  { id: "basketball", label: "Basketball" },
  { id: "football", label: "Football" },
  { id: "hockey", label: "Hockey" },
  { id: "soccer", label: "Soccer" },
] as const;

export type MovingSport = (typeof MOVING_SPORTS)[number]["id"];

/** A known sport, lowercase. Anything else is "", which shows only under All. */
export function normalizeSport(value: unknown): MovingSport | "" {
  if (typeof value !== "string") return "";
  const sport = value.trim().toLowerCase();
  return MOVING_SPORTS.some((option) => option.id === sport) ? (sport as MovingSport) : "";
}
