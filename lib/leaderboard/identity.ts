export type CardIdentity = {
  player: string;
  year: string;
  setName: string;
  parallel: string;
  grade: string;
  grader: string;
};

function norm(value: string | number | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Player, year, set, parallel, grade, and grader. The grade company is split off the display grade. */
export function cardIdentity(card: {
  playerName?: string | null;
  year?: number | string | null;
  setBrand?: string | null;
  parallel?: string | null;
  grade?: string | null;
}): CardIdentity {
  const rawGrade = (card.grade ?? "").trim();
  const match = /^(PSA|BGS|SGC|CGC|TAG|HGA)\s+(.+)$/i.exec(rawGrade);
  return {
    player: norm(card.playerName),
    year: norm(card.year),
    setName: norm(card.setBrand),
    parallel: norm(card.parallel),
    grade: match ? match[2].trim().toLowerCase() : norm(rawGrade),
    grader: match ? match[1].toLowerCase() : "",
  };
}

/** Same concatenation as public.card_snapshot_identity. */
export function identityKey(identity: CardIdentity): string {
  return [
    identity.player,
    identity.year,
    identity.setName,
    identity.parallel,
    identity.grade,
    identity.grader,
  ].join("|");
}

export function sameIdentity(a: CardIdentity, b: CardIdentity): boolean {
  return identityKey(a) === identityKey(b);
}
