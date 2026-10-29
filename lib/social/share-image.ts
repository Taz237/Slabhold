import type { BadgeCategory, BadgeTier } from "@/lib/badges/config";
import { slabCompany, slabNumber, tileKind } from "@/lib/collection/grid";
import { basedOnSalesLabel } from "@/lib/comps/shared-value";
import { capGrapheme, cleanImageUrl, clipText, textGraphemes, type LinkPreview } from "./link-preview";

/** What an Open Graph / Twitter image draws. Metadata copy stays on LinkPreview. */
export type ShareCardLine = {
  name: string;
  value: string;
};

/** A card photo drawn in the in-app slab look. Only public cards become slabs. */
export type ShareSlab = {
  src: string;
  graded: boolean;
  /** "PSA". Empty for raw cards. */
  company: string;
  /** "10". Empty for raw cards. */
  grade: string;
  player: string;
  /** "2023 · Prizm". */
  line: string;
};

export type ShareBadge = { category: BadgeCategory; tier: BadgeTier };

export type ShareImage = {
  kind: "home" | "profile" | "post" | "mail" | "card" | "badge" | "invite" | "collection";
  kicker: string;
  title: string;
  detail: string;
  body: string;
  authorName: string;
  authorHandle: string;
  imageUrl: string | null;
  photos: string[];
  cardLines: ShareCardLine[];
  player: string;
  yearSet: string;
  grade: string;
  valueLabel: string;
  salesLabel: string;
  showValue: boolean;
  photoFallback: boolean;
  avatarUrl: string | null;
  /** The post's own photos, at most 3. */
  postPhotos: string[];
  /** Public card photos in the slab look, at most 3. */
  slabs: ShareSlab[];
  /** Mono line for the first public card: player, year, set, parallel, grade. */
  chip: string;
  /** Profile pins when show_badges is on, or the shared badge. */
  badges: ShareBadge[];
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const USERNAME = /^[a-z0-9_]{3,20}$/;
const DOLLAR = /^\$\d[\d,]*(?:\.\d{1,2})?$/;
const LAST_SOLD = /^Last sold \$[\d,]+\.\d{2}(?: on [A-Z][a-z]{2} \d{1,2})?$/;
const RANGE =
  /^(?:~\$[\d,]+\.\d{2}|\$[\d,]+\.\d{2}(?:\u2013\$[\d,]+\.\d{2})?) from \d+ sales?$/;
const AMOUNT = /\$[\d,]+(?:\.\d{1,2})?/g;

function blank(): Omit<ShareImage, "kind" | "kicker" | "title" | "detail"> {
  return {
    body: "",
    authorName: "",
    authorHandle: "",
    imageUrl: null,
    photos: [],
    cardLines: [],
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

/** Grade and set fields for a public card, as the loaders read them. */
export type ShareCardFields = {
  player?: string | null;
  yearLabel?: string | null;
  year?: number | null;
  setBrand?: string | null;
  parallel?: string | null;
  grade?: string | null;
  grader?: string | null;
  conditionType?: "raw" | "graded" | null;
};

function yearOf(card: ShareCardFields): string {
  const label = (card.yearLabel ?? "").trim();
  if (label) return label;
  return card.year != null && card.year > 0 ? String(Math.floor(card.year)) : "";
}

function cleanParallel(value: string | null | undefined): string {
  const text = scrubPublicText(value);
  return /^base$/i.test(text) ? "" : text;
}

/** The slab label for one card. Raw cards get the case with no grade. */
export function shareSlab(src: string, card: ShareCardFields): ShareSlab {
  const fields = { grade: card.grade ?? "", grader: card.grader ?? "", conditionType: card.conditionType ?? null };
  const graded = tileKind(fields) === "slab";
  return {
    src,
    graded,
    company: graded ? clipText(scrubPublicText(slabCompany(fields)), 8) : "",
    grade: graded ? clipText(scrubPublicText(slabNumber(fields)), 6) : "",
    player: clipText(scrubPublicText(card.player), 32),
    line: clipText(scrubPublicText([yearOf(card), card.setBrand ?? ""].filter(Boolean).join(" · ")), 40),
  };
}

/**
 * "PUKA NACUA · 2023 PRIZM · SILVER". No grade: the slab label already shows
 * it, and on long names it was the part that got cut off.
 */
export function shareChip(card: ShareCardFields): string {
  const yearSet = [yearOf(card), scrubPublicText(card.setBrand)].filter(Boolean).join(" ");
  const parts = [scrubPublicText(card.player), yearSet, cleanParallel(card.parallel)].filter(Boolean);
  return clipText(parts.join(" · ").toUpperCase(), 64);
}

/** Drop emails and ids, then collapse whitespace. Optional hard cap, no ellipsis. */
export function scrubPublicText(
  value: string | null | undefined,
  max?: number,
): string {
  const text = (value ?? "")
    .replace(EMAIL, " ")
    .replace(UUID, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (max == null) return text;
  const parts = textGraphemes(text).map(capGrapheme);
  const shortened = parts.join("");
  if (shortened.length <= max) return shortened;
  let out = "";
  for (const part of parts) {
    if (out.length + part.length > max) break;
    out += part;
  }
  return out.trimEnd();
}

function publicHandle(value: string | null | undefined): string {
  const handle = (value ?? "").trim().replace(/^@/, "").toLowerCase();
  return USERNAME.test(handle) ? handle : "";
}

function amountsArePriced(text: string): boolean {
  const amounts = text.match(AMOUNT) ?? [];
  if (!amounts.length) return false;
  return amounts.every((amount) => {
    const value = Number(amount.slice(1).replace(/,/g, ""));
    return Number.isFinite(value) && value >= 0.01;
  });
}

/** A public comps amount. Status sentences, sub-cent figures, and private figures are dropped. */
export function publicDollar(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!(DOLLAR.test(text) || LAST_SOLD.test(text) || RANGE.test(text))) return "";
  if (!amountsArePriced(text)) return "";
  return text;
}

function uniquePhotos(urls: readonly (string | null | undefined)[]): string[] {
  const found: string[] = [];
  for (const url of urls) {
    const clean = cleanImageUrl(url);
    if (!clean || found.includes(clean)) continue;
    found.push(clean);
    if (found.length >= 3) break;
  }
  return found;
}

export function homeShareImage(): ShareImage {
  return {
    ...blank(),
    kind: "home",
    kicker: "FOR COLLECTORS",
    title: "Sports cards, together.",
    detail: "Portfolio, flips, and a feed of collectors.",
  };
}

export function profileShareImage(
  preview: LinkPreview,
  kicker: string,
  extra: {
    username?: string | null;
    /** Only pass pins when show_badges is on. */
    badges?: readonly ShareBadge[];
    /** Public card photos with their details. */
    cards?: readonly ({ imageUrl?: string | null } & ShareCardFields)[];
  } = {},
): ShareImage {
  const avatar = cleanImageUrl(preview.imageUrl);
  const slabs: ShareSlab[] = [];
  for (const card of extra.cards ?? []) {
    const src = cleanImageUrl(card.imageUrl);
    if (!src || slabs.some((slab) => slab.src === src)) continue;
    slabs.push(shareSlab(src, card));
    if (slabs.length >= 3) break;
  }
  return {
    ...blank(),
    kind: "profile",
    kicker,
    title: clipText(scrubPublicText(preview.title), 80) || "Profile",
    detail: clipText(scrubPublicText(preview.detail), 80),
    imageUrl: avatar,
    avatarUrl: avatar,
    authorHandle: publicHandle(extra.username),
    badges: (extra.badges ?? []).slice(0, 3),
    slabs,
  };
}

/**
 * Photos a Mail Day post already published.
 * Paid, email, and id fields on the meta object are ignored.
 */
export function mailDayPhotoUrls(
  meta: unknown,
  imageUrl?: string | null,
): string[] {
  const raw: string[] = [];
  if (meta && typeof meta === "object") {
    const record = meta as Record<string, unknown>;
    const cards = record.cards;
    if (Array.isArray(cards)) {
      for (const item of cards) {
        if (!item || typeof item !== "object") continue;
        const photos = (item as { photos?: unknown }).photos;
        if (!Array.isArray(photos)) continue;
        for (const photo of photos) {
          if (typeof photo === "string") raw.push(photo);
        }
      }
    }
    if (Array.isArray(record.photos)) {
      for (const photo of record.photos) {
        if (typeof photo === "string") raw.push(photo);
      }
    }
  }
  if (imageUrl) raw.push(imageUrl);
  return uniquePhotos(raw);
}

export function postShareImage(input: {
  found: boolean;
  body?: string | null;
  authorName?: string | null;
  authorHandle?: string | null;
  imageUrl?: string | null;
  postType?: "post" | "mail_day" | null;
  mailDayPhotos?: readonly (string | null | undefined)[] | null;
  avatarUrl?: string | null;
  /** The post's own photos (image_url and meta.images). */
  postPhotos?: readonly (string | null | undefined)[] | null;
  cards?: readonly ({
    isPublic: boolean;
    name?: string | null;
    valueLabel?: string | null;
    imageUrl?: string | null;
    /** The photo saved on the post's card snapshot. Used only when the card is public. */
    snapshotImageUrl?: string | null;
  } & ShareCardFields)[] | null;
}): ShareImage {
  const mail = input.found && input.postType === "mail_day";
  const body = input.found ? scrubPublicText(input.body, 280) : "";
  const authorHandle = input.found ? publicHandle(input.authorHandle) : "";
  const authorName = input.found ? clipText(scrubPublicText(input.authorName), 48) : "";
  const cardLines: ShareCardLine[] = [];
  const slabs: ShareSlab[] = [];
  let chip = "";
  let cardPhoto: string | null = null;
  if (input.found) {
    for (const card of input.cards ?? []) {
      if (!card.isPublic) continue;
      const src = cleanImageUrl(card.imageUrl) || cleanImageUrl(card.snapshotImageUrl);
      if (src && slabs.length < 3 && !slabs.some((slab) => slab.src === src)) {
        slabs.push(shareSlab(src, { ...card, player: card.player ?? card.name }));
      }
      if (!chip && card.player) chip = shareChip(card);
      const name = clipText(scrubPublicText(card.name), 80);
      if (!name) continue;
      if (!chip) chip = clipText(name.toUpperCase(), 64);
      if (cardLines.length >= 3) continue;
      cardLines.push({ name, value: publicDollar(card.valueLabel) });
      if (!cardPhoto) cardPhoto = src;
    }
  }
  const photos = mail ? uniquePhotos([...(input.mailDayPhotos ?? []), input.imageUrl]) : [];
  const imageUrl = mail ? null : cleanImageUrl(input.imageUrl) || cardPhoto;
  return {
    ...blank(),
    kind: mail ? "mail" : "post",
    kicker: "POST",
    title: body ? clipText(body, 90) : "Post",
    detail: "",
    body: body || "Post",
    authorName,
    authorHandle,
    imageUrl,
    photos,
    cardLines,
    photoFallback: false,
    avatarUrl: input.found ? cleanImageUrl(input.avatarUrl) : null,
    postPhotos: input.found && !mail ? uniquePhotos([input.imageUrl, ...(input.postPhotos ?? [])]) : [],
    slabs,
    chip,
  };
}

export type PostLayout = "photo" | "slab" | "fan-slabs" | "fan-photos" | "text";

/**
 * Which hero a post preview draws. Several cards fan out as slabs; the
 * post's own photo beats a single card; nothing public falls back to text.
 */
export function postLayout(model: Pick<ShareImage, "kind" | "photos" | "postPhotos" | "slabs">): PostLayout {
  if (model.kind === "mail") return model.photos.length > 1 ? "fan-photos" : model.photos.length ? "photo" : "text";
  if (model.slabs.length >= 2) return "fan-slabs";
  if (model.postPhotos.length >= 2) return "fan-photos";
  if (model.postPhotos.length === 1) return "photo";
  if (model.slabs.length === 1) return "slab";
  return "text";
}

/** iMessage shows the caption under the image, so it names the author and carries the post. */
export function postOgCopy(input: {
  authorName?: string | null;
  authorHandle?: string | null;
  body?: string | null;
}): { title: string; description: string } | null {
  const name = clipText(scrubPublicText(input.authorName), 48) || (publicHandle(input.authorHandle) ? `@${publicHandle(input.authorHandle)}` : "");
  if (!name) return null;
  const body = clipText(scrubPublicText(input.body), 220);
  return { title: `${name} on Slabhold`, description: body || `A post by ${name} on Slabhold.` };
}

export function cardShareImage(input: {
  found: boolean;
  isPublic?: boolean;
  /** False hides the dollar amount even when the card itself is public. */
  pricePublic?: boolean;
  player?: string | null;
  yearLabel?: string | null;
  year?: number | null;
  setBrand?: string | null;
  grade?: string | null;
  imageUrl?: string | null;
  valueAmount?: string | null;
  salesCount?: number | null;
  parallel?: string | null;
  grader?: string | null;
  conditionType?: "raw" | "graded" | null;
  /** The owner's @handle, shown under the card. */
  ownerHandle?: string | null;
}): ShareImage {
  const visible = Boolean(input.found && input.isPublic);
  const player = visible ? clipText(scrubPublicText(input.player), 48) : "";
  const year = visible
    ? (input.yearLabel ?? "").trim() ||
      (input.year != null && input.year > 0 ? String(Math.floor(input.year)) : "")
    : "";
  const yearSet = visible
    ? clipText(scrubPublicText([year, input.setBrand ?? ""].filter(Boolean).join(" ")), 64)
    : "";
  const grade = visible ? clipText(scrubPublicText(input.grade), 32) : "";
  const imageUrl = visible ? cleanImageUrl(input.imageUrl) : null;
  const showPrice = Boolean(visible && input.pricePublic !== false);
  const valueLabel = showPrice ? publicDollar(input.valueAmount) : "";
  const estimate = DOLLAR.test(valueLabel);
  const salesCount =
    estimate && Number.isFinite(input.salesCount) ? Math.floor(input.salesCount as number) : 0;
  const salesLabel = estimate && salesCount >= 1 ? basedOnSalesLabel(salesCount) : "";
  const name = player || "Card";
  return {
    ...blank(),
    kind: "card",
    kicker: "CARD",
    title: name,
    detail: "",
    player: name,
    yearSet,
    grade,
    imageUrl,
    valueLabel,
    salesLabel,
    showValue: Boolean(valueLabel),
    photoFallback: !imageUrl,
    authorHandle: visible ? publicHandle(input.ownerHandle) : "",
    slabs: imageUrl ? [shareSlab(imageUrl, { ...input, player: name })] : [],
    chip: visible ? clipText(scrubPublicText([cleanParallel(input.parallel)].filter(Boolean).join(" · ")).toUpperCase(), 40) : "",
  };
}

/** A shared badge. The page and loader decide it is earned and shown before this runs. */
export function badgeShareImage(input: {
  category: BadgeCategory;
  tier: BadgeTier;
  name: string;
  tierLabel: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  earnedLabel?: string | null;
}): ShareImage {
  const handle = publicHandle(input.username);
  return {
    ...blank(),
    kind: "badge",
    kicker: input.tierLabel,
    title: input.name,
    detail: scrubPublicText(input.earnedLabel),
    authorName: clipText(scrubPublicText(input.displayName), 48),
    authorHandle: handle,
    avatarUrl: cleanImageUrl(input.avatarUrl),
    badges: [{ category: input.category, tier: input.tier }],
  };
}

/** True for the image a private, deleted, or unknown card gets. */
export function isGenericCardImage(model: ShareImage): boolean {
  return JSON.stringify(model) === JSON.stringify(cardShareImage({ found: false }));
}

/** A public collector as the invite and collection images draw them. */
export type ShareCollector = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Public cards with photos, most valuable first. */
  cards: readonly ({ imageUrl?: string | null } & ShareCardFields)[];
  /** Every public card, with or without a photo. Null when unknown. */
  publicCardCount?: number | null;
};

function collectorSlabs(collector: ShareCollector, limit: number): ShareSlab[] {
  const slabs: ShareSlab[] = [];
  for (const card of collector.cards) {
    const src = cleanImageUrl(card.imageUrl);
    if (!src || slabs.some((slab) => slab.src === src)) continue;
    slabs.push(shareSlab(src, card));
    if (slabs.length >= limit) break;
  }
  return slabs;
}

function collectorName(collector: ShareCollector, handle: string): string {
  return clipText(scrubPublicText(collector.displayName), 40) || handle;
}

/**
 * "<Name> invited you to Slabhold" with their avatar and up to 3 public card
 * photos. Null (unknown, reserved or unreadable) is the generic invite: no
 * name, no photos, nothing about anyone.
 */
export function inviteShareImage(collector: ShareCollector | null): ShareImage {
  const handle = collector ? publicHandle(collector.username) : "";
  if (!collector || !handle) {
    return {
      ...blank(),
      kind: "invite",
      kicker: "YOU'RE INVITED",
      title: "Slabhold",
      detail: "",
      body: "You're invited to Slabhold",
    };
  }
  const name = collectorName(collector, handle);
  const avatar = cleanImageUrl(collector.avatarUrl);
  return {
    ...blank(),
    kind: "invite",
    kicker: "YOU'RE INVITED",
    title: name,
    detail: "",
    body: `${name} invited you to Slabhold`,
    authorName: name,
    authorHandle: handle,
    imageUrl: avatar,
    avatarUrl: avatar,
    slabs: collectorSlabs(collector, 3),
  };
}

/**
 * Top 4 to 6 public cards by value, the public card count and the handle.
 * Null is the generic collection image, never anyone's cards.
 */
export function collectionShareImage(collector: ShareCollector | null): ShareImage {
  const handle = collector ? publicHandle(collector.username) : "";
  if (!collector || !handle) {
    return { ...blank(), kind: "collection", kicker: "COLLECTION", title: "Slabhold", detail: "" };
  }
  const name = collectorName(collector, handle);
  const avatar = cleanImageUrl(collector.avatarUrl);
  const count = collector.publicCardCount;
  return {
    ...blank(),
    kind: "collection",
    kicker: "COLLECTION",
    title: name,
    detail: count == null ? "" : count === 1 ? "1 card" : `${count} cards`,
    authorName: name,
    authorHandle: handle,
    imageUrl: avatar,
    avatarUrl: avatar,
    slabs: collectorSlabs(collector, 6),
  };
}

/** True for the generic invite or collection image: no collector is drawn. */
export function isGenericCollectorImage(model: ShareImage): boolean {
  return !model.authorHandle;
}
