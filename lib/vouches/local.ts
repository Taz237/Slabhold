import {
  cleanVouchText,
  emptySummary,
  LIST_MAX,
  LIST_PAGE,
  MIN_CHAT_HOURS,
  vouchHintCopy,
  vouchNoteProblem,
  vouchReplyProblem,
  type VouchHint,
  type VouchRating,
  type VouchSummary,
} from "./rules";
import type { VouchBackend, VouchRow, VouchStatus, VouchWriteResult } from "./types";

/**
 * Local mode (no Supabase): vouches live on this device, starting from a few sample ones between
 * the sample collectors, so the screens can be seen and photographed without the database.
 * The notes follow the same rules. When the caller passes this device's messages (`chat`), the
 * two message rules apply too: a message each way, and 24 hours since you've both messaged.
 * Account age isn't checked here.
 */
export const LOCAL_VOUCHES_KEY = "slabhold.local-vouches.v1";

export type LocalVouchPerson = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  accent?: string | null;
  createdAt?: string | null;
};

type StoredVouch = {
  id: string;
  voucherId: string;
  subjectId: string;
  rating: VouchRating;
  note: string;
  createdAt: string;
  editedAt: string | null;
  reply: string | null;
  replyAt: string | null;
  replyEditedAt: string | null;
  hasLoggedDeal: boolean;
};

type Stored = { vouches: StoredVouch[] };

/** A direct message on this device: who sent it to whom, and when. */
export type LocalChatMessage = { senderId: string; receiverId: string; createdAt: string };

/** Why these two can't vouch yet, from their messages. The same two checks, in the same order, as the database. */
export function chatRefusal(messages: readonly LocalChatMessage[], viewerId: string, subjectId: string, now: number): VouchHint | null {
  const firstFrom = (from: string, to: string) =>
    messages.reduce<number | null>((first, message) => {
      if (message.senderId !== from || message.receiverId !== to) return first;
      const at = Date.parse(message.createdAt);
      return Number.isFinite(at) && (first === null || at < first) ? at : first;
    }, null);
  const mine = firstFrom(viewerId, subjectId);
  const theirs = firstFrom(subjectId, viewerId);
  if (mine === null || theirs === null) return "vouch_no_conversation";
  // The later of the two first messages: each side's first message must be a day old.
  return Math.max(mine, theirs) > now - MIN_CHAT_HOURS * 60 * 60 * 1000 ? "vouch_conversation_too_new" : null;
}
type KeyValue = Pick<Storage, "getItem" | "setItem">;

/**
 * Made-up collectors who only exist to leave sample vouches, on top of the sample people in
 * lib/social/local-db.ts (user-maya, user-jordan, user-sam), which the caller passes in as
 * `people`. Nobody here is a real account.
 */
const SAMPLE_NAMES: readonly [string, string][] = [
  ["kevpulls", "Kev Marlow"],
  ["deeslabs", "Dee Okafor"],
  ["riorookies", "Rio Vance"],
  ["toploaderted", "Ted Brandt"],
  ["nina_pc", "Nina Castell"],
  ["hoopsbyhal", "Hal Whitaker"],
  ["grailhunt", "Priya Raman"],
  ["sundaywax", "Marcus Bell"],
  ["cornersharp", "Lena Fischer"],
  ["rookieyear", "Owen Tate"],
  ["thebinder", "Sofia Marin"],
  ["onetouch", "Darnell Reyes"],
  ["refractorron", "Ron Akers"],
  ["pennysleeve", "Amy Lindqvist"],
  ["slabsandsuch", "Theo Nakamura"],
  ["papergrader", "Wes Coleman"],
  ["midnightrips", "Jo Hartley"],
  ["sgcsteve", "Steve Pruitt"],
  ["chasecards", "Imani Brooks"],
  ["setbuilder", "Gus Lindholm"],
  ["cardshowcal", "Cal Dempsey"],
  ["junkwaxjen", "Jen Okoro"],
  ["firstbowman", "Milo Strand"],
  ["patchwork", "Bea Santoro"],
];
const SAMPLE_ACCENTS = ["#7c5cff", "#22c55e", "#0ea5e9", "#f97316", "#f43f5e", "#fbbf24"];

export const SAMPLE_PEOPLE: readonly LocalVouchPerson[] = SAMPLE_NAMES.map(([username, displayName], index) => ({
  id: `sample-${username}`,
  username,
  displayName,
  accent: SAMPLE_ACCENTS[index % SAMPLE_ACCENTS.length],
  createdAt: new Date(Date.UTC(2026, index % 10, 3 + index)).toISOString(),
}));

const HOUR = 60 * 60 * 1000;

const POSITIVE_NOTES = [
  "Shipped fast, card as shown.",
  "Easy trade. Packed in a top loader and a team bag.",
  "",
  "Paid within the hour. Would deal again.",
  "Card looked better in hand than in the photos.",
  "Good comms the whole way.",
  "Smooth deal, tracking sent same day.",
  "",
  "Fair price and no haggling games.",
  "Second deal with this collector. Same as the first.",
];

/**
 * Sample vouches for the three sample collectors:
 *   user-maya   many (26): every rating, replies, an edited vouch, logged deals, more than one page.
 *   user-sam    a few (4).
 *   user-jordan none, for the empty page.
 */
export function sampleVouches(now: number): StoredVouch[] {
  const at = (hoursAgo: number) => new Date(now - hoursAgo * HOUR).toISOString();
  const row = (
    id: string,
    voucher: number,
    subjectId: string,
    rating: VouchRating,
    note: string,
    hoursAgo: number,
    extra: Partial<StoredVouch> = {},
  ): StoredVouch => ({
    id,
    voucherId: SAMPLE_PEOPLE[voucher]!.id,
    subjectId,
    rating,
    note,
    createdAt: at(hoursAgo),
    editedAt: null,
    reply: null,
    replyAt: null,
    replyEditedAt: null,
    hasLoggedDeal: false,
    ...extra,
  });
  const maya: StoredVouch[] = [
    row("sample-vouch-1", 0, "user-maya", "positive", POSITIVE_NOTES[0]!, 20, { hasLoggedDeal: true }),
    row("sample-vouch-2", 1, "user-maya", "positive", POSITIVE_NOTES[1]!, 52, { reply: "Thanks Dee, same on my end.", replyAt: at(50) }),
    row("sample-vouch-3", 2, "user-maya", "positive", "", 90),
    row("sample-vouch-4", 3, "user-maya", "neutral", "Took a week to ship, but it showed up as described.", 200, { editedAt: at(150) }),
    row("sample-vouch-5", 4, "user-maya", "negative", "Corner ding that wasn't in the photos.", 400, {
      reply: "Refunded the difference the same day.",
      replyAt: at(390),
      replyEditedAt: at(380),
    }),
    row("sample-vouch-6", 5, "user-maya", "neutral", "Fine in the end, just slow to answer messages.", 470),
  ];
  for (let index = 6; index < 24; index += 1) {
    maya.push(
      row(`sample-vouch-${index + 1}`, index, "user-maya", "positive", POSITIVE_NOTES[index % POSITIVE_NOTES.length]!, 500 + index * 31, {
        hasLoggedDeal: index % 5 === 0,
      }),
    );
  }
  // Two more from the other sample collectors, so the page has people the device already knows.
  maya.push({ ...row("sample-vouch-25", 0, "user-maya", "positive", "Card arrived early.", 36), voucherId: "user-sam" });
  maya.push({ ...row("sample-vouch-26", 0, "user-maya", "positive", "Smooth deal, quick payment.", 75), voucherId: "user-jordan" });
  return [
    ...maya,
    row("sample-vouch-s1", 0, "user-sam", "positive", "Shipped next morning in a one-touch.", 30, { hasLoggedDeal: true }),
    row("sample-vouch-s2", 6, "user-sam", "positive", "", 110),
    row("sample-vouch-s3", 9, "user-sam", "positive", "Honest about a print line before I paid.", 260, { reply: "Appreciate it, Owen.", replyAt: at(255) }),
    { ...row("sample-vouch-s4", 0, "user-sam", "neutral", "Good card, but the trade took three weeks.", 700), voucherId: "user-maya" },
  ];
}

function browserStorage(): KeyValue | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isStoredVouch(value: unknown): value is StoredVouch {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.voucherId === "string" &&
    typeof row.subjectId === "string" &&
    typeof row.createdAt === "string" &&
    (row.rating === "positive" || row.rating === "neutral" || row.rating === "negative")
  );
}

const refuse = (hint: VouchHint, handle?: string): VouchWriteResult => ({ ok: false, error: vouchHintCopy(hint, handle), hint });

export function localVouchBackend(
  options: {
    storage?: KeyValue | null;
    /** Whoever is signed in on this device, or null. */
    viewer?: LocalVouchPerson | null;
    /** Vouchers the viewer follows, for the social proof line. */
    following?: readonly string[];
    /** Everyone this device knows, so a voucher shows with their name and photo. */
    people?: readonly LocalVouchPerson[];
    /** This device's messages. With them, a new vouch needs the same chat the database asks for. */
    chat?: readonly LocalChatMessage[] | null;
    now?: () => number;
  } = {},
): VouchBackend {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const viewer = options.viewer ?? null;
  const now = options.now ?? Date.now;
  const following = new Set(options.following ?? []);
  const people = new Map<string, LocalVouchPerson>();
  for (const person of [...SAMPLE_PEOPLE, ...(options.people ?? []), ...(viewer ? [viewer] : [])]) people.set(person.id, person);
  let memory: Stored | null = null;

  function read(): Stored {
    try {
      const raw = storage?.getItem(LOCAL_VOUCHES_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        const list = parsed && typeof parsed === "object" ? (parsed as { vouches?: unknown }).vouches : null;
        if (Array.isArray(list)) return { vouches: list.filter(isStoredVouch) };
      }
    } catch {
      // Unreadable: start again from the samples.
    }
    return memory ?? { vouches: sampleVouches(now()) };
  }

  function write(next: Stored): boolean {
    memory = next;
    try {
      storage?.setItem(LOCAL_VOUCHES_KEY, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }

  /** Vouches from someone this device no longer knows are left out, the way a deleted account's are. */
  const visible = (stored: Stored) => stored.vouches.filter((vouch) => people.has(vouch.voucherId));

  function summaryOf(stored: Stored, userId: string): VouchSummary {
    const about = visible(stored).filter((vouch) => vouch.subjectId === userId);
    if (about.length === 0) return emptySummary(userId);
    const newestFirst = [...about].sort(byNewest);
    const followed = newestFirst.filter((vouch) => following.has(vouch.voucherId));
    return {
      userId,
      total: about.length,
      positive: about.filter((vouch) => vouch.rating === "positive").length,
      neutral: about.filter((vouch) => vouch.rating === "neutral").length,
      negative: about.filter((vouch) => vouch.rating === "negative").length,
      lastVouchAt: newestFirst[0]?.createdAt ?? null,
      followedCount: followed.length,
      followedSampleUsername: followed[0] ? (people.get(followed[0].voucherId)?.username ?? null) : null,
    };
  }

  function toRow(stored: Stored, vouch: StoredVouch): VouchRow {
    const person = people.get(vouch.voucherId)!;
    return {
      id: vouch.id,
      rating: vouch.rating,
      note: vouch.note,
      createdAt: vouch.createdAt,
      editedAt: vouch.editedAt,
      reply: vouch.reply,
      replyAt: vouch.reply ? vouch.replyAt : null,
      replyEditedAt: vouch.reply ? vouch.replyEditedAt : null,
      voucher: {
        id: person.id,
        username: person.username,
        displayName: person.displayName,
        avatarUrl: person.avatarUrl ?? null,
        accent: person.accent ?? null,
        createdAt: person.createdAt ?? null,
        vouchTotal: summaryOf(stored, person.id).total,
      },
      hasLoggedDeal: vouch.hasLoggedDeal,
    };
  }

  return {
    async summaries(userIds) {
      const stored = read();
      return new Map([...new Set(userIds)].map((id) => [id, summaryOf(stored, id)]));
    },
    async list(subjectId, listOptions = {}) {
      const stored = read();
      const limit = Math.min(Math.max(Math.floor(listOptions.limit ?? LIST_PAGE), 1), LIST_MAX);
      const before = listOptions.before ?? null;
      const all = visible(stored)
        .filter((vouch) => vouch.subjectId === subjectId && (!listOptions.rating || vouch.rating === listOptions.rating))
        .sort(byNewest)
        .filter((vouch) => !before || vouch.createdAt < before.createdAt || (vouch.createdAt === before.createdAt && vouch.id < before.id));
      const page = all.slice(0, limit);
      const last = page.length >= limit ? page[page.length - 1] : null;
      return { rows: page.map((vouch) => toRow(stored, vouch)), next: last ? { createdAt: last.createdAt, id: last.id } : null };
    },
    async status(subjectId): Promise<VouchStatus> {
      if (!viewer) return { canVouch: false, reason: "vouch_signed_out", mine: null };
      if (viewer.id === subjectId) return { canVouch: false, reason: "vouch_self", mine: null };
      const mine = read().vouches.find((vouch) => vouch.voucherId === viewer.id && vouch.subjectId === subjectId);
      // Editing your own vouch is always allowed. A new one needs the chat.
      const reason = mine || !options.chat ? null : chatRefusal(options.chat, viewer.id, subjectId, now());
      return { canVouch: !reason, reason, mine: mine ? { id: mine.id, rating: mine.rating, note: mine.note } : null };
    },
    async upsert(subjectId, rating, note) {
      if (!viewer) return refuse("vouch_signed_out");
      if (viewer.id === subjectId) return refuse("vouch_self");
      const problem = vouchNoteProblem(rating, note);
      if (problem) return refuse(problem);
      const body = cleanVouchText(note);
      const stored = read();
      const existing = stored.vouches.find((vouch) => vouch.voucherId === viewer.id && vouch.subjectId === subjectId);
      const notYet = existing || !options.chat ? null : chatRefusal(options.chat, viewer.id, subjectId, now());
      if (notYet) return refuse(notYet, people.get(subjectId)?.username);
      const stamp = new Date(now()).toISOString();
      const next: StoredVouch = existing
        ? existing.rating === rating && existing.note === body
          ? existing
          : { ...existing, rating, note: body, editedAt: stamp }
        : {
            id: `local-vouch-${viewer.id}-${subjectId}`,
            voucherId: viewer.id,
            subjectId,
            rating,
            note: body,
            createdAt: stamp,
            editedAt: null,
            reply: null,
            replyAt: null,
            replyEditedAt: null,
            hasLoggedDeal: false,
          };
      const vouches = existing ? stored.vouches.map((vouch) => (vouch === existing ? next : vouch)) : [...stored.vouches, next];
      if (!write({ vouches })) return { ok: false, error: "Couldn't save that. Try again.", hint: null };
      return { ok: true, id: next.id };
    },
    async remove(subjectId) {
      if (!viewer) return refuse("vouch_signed_out");
      const stored = read();
      const vouches = stored.vouches.filter((vouch) => !(vouch.voucherId === viewer.id && vouch.subjectId === subjectId));
      if (vouches.length !== stored.vouches.length && !write({ vouches })) return { ok: false, error: "Couldn't save that. Try again.", hint: null };
      return { ok: true };
    },
    async reply(vouchId, text) {
      if (!viewer) return refuse("vouch_signed_out");
      const stored = read();
      const target = stored.vouches.find((vouch) => vouch.id === vouchId);
      if (!target) return refuse("vouch_not_found");
      if (target.subjectId !== viewer.id) return refuse("vouch_not_yours");
      const problem = vouchReplyProblem(text);
      if (problem) return refuse(problem);
      const body = cleanVouchText(text);
      const stamp = new Date(now()).toISOString();
      const next: StoredVouch =
        body === ""
          ? { ...target, reply: null, replyAt: null, replyEditedAt: null }
          : target.reply
            ? target.reply === body
              ? target
              : { ...target, reply: body, replyEditedAt: stamp }
            : { ...target, reply: body, replyAt: stamp, replyEditedAt: null };
      if (!write({ vouches: stored.vouches.map((vouch) => (vouch === target ? next : vouch)) })) {
        return { ok: false, error: "Couldn't save that. Try again.", hint: null };
      }
      return { ok: true, id: target.id };
    },
  };
}

function byNewest(a: StoredVouch, b: StoredVouch) {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}
