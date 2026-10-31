import type { ShareImage } from "@/lib/social/share-image";

export const ESTIMATED_FROM_SOLD = "Est. from recent sold prices";

export function rankShareText(input: { username: string; percent: number }): string {
  const handle = input.username.trim().replace(/^@+/, "");
  if (input.percent >= 1) return `@${handle} up 100% or more this week on Slabhold`;
  const magnitude = Math.abs(input.percent * 100).toFixed(1);
  const direction = input.percent < 0 ? "down" : "up";
  return `@${handle} ${direction} ${magnitude}% this week on Slabhold`;
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
    avatarUrl: null,
    postPhotos: [],
    slabs: [],
    chip: "",
    badges: [],
  };
}

/** Value-board preview. Percents only: no collection totals and no team marks. */
export function leaderboardBoardShareImage(
  rows: readonly { username: string; percentLabel: string }[],
): ShareImage {
  return image({
    kicker: "VALUE",
    title: "Value leaderboard",
    detail: ESTIMATED_FROM_SOLD,
    cardLines: rows.slice(0, 3).map((row) => ({
      name: `@${row.username.replace(/^@+/, "")}`,
      value: row.percentLabel,
    })),
  });
}

export function leaderboardRankShareImage(input: {
  username: string;
  percent: number;
}): ShareImage {
  return image({
    kicker: "VALUE",
    title: rankShareText(input),
    detail: ESTIMATED_FROM_SOLD,
    cardLines: [],
  });
}
