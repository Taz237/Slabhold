/**
 * Static sample data for the landing showcase and the onboarding intro. No
 * network, no real people. The personas are the fictional, AI-generated demo
 * accounts from public/landing/avatars/personas.md: handles and names are
 * copied from that file (a test checks), and every place that shows them
 * says they are sample accounts.
 */

export type Persona = { handle: string; name: string };

/** From personas.md. Never real users, never linked, never followable. */
export const PERSONAS = {
  paolo: { handle: "paolo_lolocards", name: "Paolo Dimaculangan" },
  minh: { handle: "minh_rookieroom", name: "Minh Tran" },
  jake: { handle: "kitchentable_pc", name: "Jake Lindgren" },
  dev: { handle: "loupe_and_labels", name: "Dev Raman" },
  sami: { handle: "sami_rookiehunt", name: "Sami Nassar" },
  andre: { handle: "rinkside_andre", name: "André Desjarlais" },
  diego: { handle: "diegos_gridiron_pc", name: "Diego Ramírez" },
  femi: { handle: "femi_matchday", name: "Femi Okafor" },
} as const satisfies Record<string, Persona>;

/** Each persona's own 256×256 avatar, served as is (no optimizer). */
export function avatarSrc(persona: Persona): string {
  return `/landing/avatars/${persona.handle}.webp`;
}

/** Shown next to every feed of personas. */
export const SAMPLE_ACCOUNTS_NOTE = "Sample accounts";
export const SAMPLE_ACCOUNTS_LABEL = "Sample accounts, not real collectors";

export type SamplePost = {
  id: string;
  persona: Persona;
  ago: string;
  body: string;
  replies: number;
  likes: number;
  /** A pickup shows the Pickup pill and a sample slab. */
  pickup?: boolean;
  /** A reply under the post before it. */
  replyTo?: Persona;
};

/** Pickups and questions, the way the feed reads. No sales talk. */
export const SAMPLE_POSTS: readonly SamplePost[] = [
  {
    id: "p1",
    persona: PERSONAS.jake,
    ago: "12m",
    body: "Sunday packs at the kitchen table. She pulled the numbered card again.",
    replies: 6,
    likes: 41,
    pickup: true,
  },
  {
    id: "p2",
    persona: PERSONAS.minh,
    ago: "40m",
    body: "Which rookie class are you stacking this year? I'm all in on the guards.",
    replies: 14,
    likes: 23,
  },
  {
    id: "p3",
    persona: PERSONAS.sami,
    ago: "38m",
    body: "Guards for me too. Saving up for the next card show.",
    replies: 2,
    likes: 9,
    replyTo: PERSONAS.minh,
  },
  {
    id: "p4",
    persona: PERSONAS.dev,
    ago: "1h",
    body: "Centering looks 55/45 on this one. Send it in or keep it raw?",
    replies: 18,
    likes: 32,
  },
  {
    id: "p5",
    persona: PERSONAS.andre,
    ago: "2h",
    body: "Two cards left to finish the '79 hockey set. Getting close.",
    replies: 4,
    likes: 57,
  },
  {
    id: "p6",
    persona: PERSONAS.paolo,
    ago: "3h",
    body: "Finally got this back from PSA. Jordan Love 10. Worth the wait.",
    replies: 9,
    likes: 64,
    pickup: true,
  },
];

/** The pickup that shows a real card (PickupDemo) when the page hands one over. */
export const REAL_PICKUP_POST = "p6";

/**
 * A real graded card from the founder's public collection, for the timeline's
 * pickup post. Only what the slab draws: the photo, the player, the year and
 * set (empty when missing) and the grade.
 */
export type PickupDemo = { player: string; year: string; set: string; grader: string; grade: string; photoUrl: string };

/** A made-up card. Its photo is the neutral sample slab, so no logos. */
export const SAMPLE_QUERY = "2023 Sample Rookie Prizm Grade 10";

/** Recent sold prices for the sample card, newest first, whole dollars. */
export const SAMPLE_SALES: readonly { price: number; ago: string }[] = [
  { price: 418, ago: "2d" },
  { price: 405, ago: "5d" },
  { price: 412, ago: "8d" },
  { price: 396, ago: "11d" },
  { price: 425, ago: "15d" },
];

function percentile(sorted: number[], p: number): number {
  const at = (sorted.length - 1) * (p / 100);
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

/** The median and the middle half, the same cut Quick Comp shows. */
export function sampleStats(sales: readonly { price: number }[] = SAMPLE_SALES) {
  const sorted = sales.map((sale) => sale.price).sort((a, b) => a - b);
  return {
    median: percentile(sorted, 50),
    p25: percentile(sorted, 25),
    p75: percentile(sorted, 75),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    count: sorted.length,
  };
}

/**
 * What the Quick Comp demo draws: the typed search, the card line and photo,
 * the newest sold prices (whole dollars) and the stats under them. `owner` is
 * set only for a real card from that collector's public collection.
 */
export type CompDemo = {
  query: string;
  label: string;
  photo: { src: string; srcSet?: string; sizes?: string };
  alt: string;
  sales: readonly { price: number; when: string }[];
  stats: { median: number; p25: number; p75: number; min: number; max: number; count: number };
  basis: string;
  owner: string | null;
};

/**
 * A sample collection value over the last 90 days, ending at $412: up $38
 * (10.2%) from $374. Dated from `today` so the axis always reads as recent.
 */
export function sampleValueLine(today: Date = new Date()): { date: string; value: number }[] {
  const values = [374, 371, 378, 383, 380, 386, 392, 389, 395, 401, 398, 404, 407, 405, 412];
  const day = 24 * 60 * 60 * 1000;
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return values.map((value, index) => ({
    date: new Date(end - (values.length - 1 - index) * 6 * day).toISOString().slice(0, 10),
    value,
  }));
}

/** Notification banners the app really sends (lib/push/prefs.ts kinds), from personas. */
export const SAMPLE_ALERTS: readonly { id: string; kind: "follow" | "like" | "reply" | "dm"; persona: Persona; text: string }[] = [
  { id: "a1", kind: "follow", persona: PERSONAS.paolo, text: "followed you" },
  { id: "a2", kind: "like", persona: PERSONAS.minh, text: "liked your pickup" },
  { id: "a3", kind: "reply", persona: PERSONAS.dev, text: "replied: Clean corners on that one" },
  { id: "a4", kind: "dm", persona: PERSONAS.femi, text: "sent you a message" },
];
