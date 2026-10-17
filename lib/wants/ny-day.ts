import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";

/** UTC instant of midnight America/New_York for the calendar day containing `now`. */
export function newYorkDayStartIso(now: Date = new Date()): string {
  const day = snapshotDateInNewYork(now);
  const probe = new Date(`${day}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(probe);
  const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT-4";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  const sign = match?.[1] === "+" ? "+" : "-";
  const hours = (match?.[2] ?? "4").padStart(2, "0");
  const mins = match?.[3] ?? "00";
  return new Date(`${day}T00:00:00${sign}${hours}:${mins}`).toISOString();
}
