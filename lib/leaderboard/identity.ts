export type CardIdentity = {
  player: string;
  year: string;
  yearLabel: string;
  setName: string;
  parallel: string;
  grade: string;
  grader: string;
  cardNumber: string;
  serialRun: string;
  isAuto: boolean;
  isRelic: boolean;
  gradeQualifier: string;
  conditionType: string;
};

function norm(value: string | number | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Every comps-matching field except the card id, so duplicate copies still share one cap. */
export function cardIdentity(card: {
  playerName?: string | null;
  year?: number | string | null;
  yearLabel?: string | null;
  setBrand?: string | null;
  parallel?: string | null;
  grade?: string | null;
  cardNumber?: string | null;
  serialRun?: number | string | null;
  isAuto?: boolean | null;
  isRelic?: boolean | null;
  gradeQualifier?: string | null;
  conditionType?: string | null;
}): CardIdentity {
  const rawGrade = (card.grade ?? "").trim();
  const match = /^(PSA|BGS|SGC|CGC|TAG|HGA)\s+(.+)$/i.exec(rawGrade);
  return {
    player: norm(card.playerName),
    year: norm(card.year),
    yearLabel: norm(card.yearLabel),
    setName: norm(card.setBrand),
    parallel: norm(card.parallel),
    grade: match ? match[2].trim().toLowerCase() : norm(rawGrade),
    grader: match ? match[1].toLowerCase() : "",
    cardNumber: norm(card.cardNumber).replace(/^#/, ""),
    serialRun: card.serialRun == null || card.serialRun === "" ? "" : norm(card.serialRun),
    isAuto: card.isAuto === true,
    isRelic: card.isRelic === true,
    gradeQualifier: norm(card.gradeQualifier),
    conditionType: norm(card.conditionType),
  };
}

/** Same concatenation as public.card_snapshot_identity. Card id is not included. */
export function identityKey(identity: CardIdentity): string {
  return [
    identity.player,
    identity.year,
    identity.yearLabel,
    identity.setName,
    identity.parallel,
    identity.grade,
    identity.grader,
    identity.cardNumber,
    identity.serialRun,
    identity.isAuto ? "1" : "0",
    identity.isRelic ? "1" : "0",
    identity.gradeQualifier,
    identity.conditionType,
  ].join("|");
}

export function sameIdentity(a: CardIdentity, b: CardIdentity): boolean {
  return identityKey(a) === identityKey(b);
}
