import type { ShareImage } from "@/lib/social/share-image";

export const ESTIMATED_FROM_SOLD = "Est. from recent sold prices";

export function rankShareText(input: {
  username: string;
  percent: number;
  window: "day" | "week";
}): string {
  const handle = input.username.trim().replace(/^@+/, "");
  const magnitude = Math.abs(input.percent * 100).toFixed(1);
  const direction = input.percent < 0 ? "down" : "up";
  const when = input.window === "week" ? "this week" : "today";
  return `@${handle} ${direction} ${magnitude}% ${when} on Slabhold`;
}

function image(partial: Pick<ShareImage, "kicker" | "title" | "detail" | "cardLines">): ShareImage {
  return {
    kind: "profile",
    kicker: partial.kicker,
    title: partial.title,
    detail: partial.detail,
    body: "",
    authorName: "",
    authorHandle: "",
    imageUrl: null,
    photos: [],
    cardLines: partial.cardLines,
    player: "",
    yearSet: "",
    grade: "",
    valueLabel: "",
    salesLabel: "",
    showValue: false,
    photoFallback: false,
  };
}

/** Board preview. Text only: no team or league marks. */
export function leaderboardBoardShareImage(
  rows: readonly { username: string; percentLabel: string }[],
): ShareImage {
  return image({
    kicker: "LEADERBOARD",
    title: "Collection leaderboard",
    detail: ESTIMATED_FROM_SOLD,
    cardLines: rows.slice(0, 3).map((row) => ({
      name: `@${row.username.replace(/^@+/, "")}`,
      value: row.percentLabel,
    })),
  });
}

/** Personal rank card. The estimate label sits under the sentence. */
export function leaderboardRankShareImage(input: {
  username: string;
  percent: number;
  window: "day" | "week";
}): ShareImage {
  return image({
    kicker: "LEADERBOARD",
    title: rankShareText(input),
    detail: ESTIMATED_FROM_SOLD,
    cardLines: [],
  });
}
