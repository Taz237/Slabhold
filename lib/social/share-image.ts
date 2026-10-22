import { basedOnSalesLabel } from "@/lib/comps/shared-value";
import { cleanImageUrl, clipText, type LinkPreview } from "./link-preview";

/** What an Open Graph / Twitter image draws. Metadata copy stays on LinkPreview. */
export type ShareCardLine = {
  name: string;
  value: string;
};

export type ShareImage = {
  kind: "home" | "profile" | "post" | "mail" | "card";
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
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const USERNAME = /^[a-z0-9_]{3,20}$/;
const DOLLAR = /^\$\d[\d,]*(?:\.\d{1,2})?$/;
const LAST_SOLD = /^Last sold \$[\d,]+\.\d{2} on [A-Z][a-z]{2} \d{1,2}$/;
const RANGE = /^\$[\d,]+\.\d{2}\u2013\$[\d,]+\.\d{2} from \d+ sales?$/;

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
  };
}

/** Drop emails and ids, then collapse whitespace. Optional hard cap, no ellipsis. */
export function scrubPublicText(
  value: string | null | undefined,
  max?: number,
): string {
  let text = (value ?? "")
    .replace(EMAIL, " ")
    .replace(UUID, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (max != null && text.length > max) text = text.slice(0, max).trimEnd();
  return text;
}

function publicHandle(value: string | null | undefined): string {
  const handle = (value ?? "").trim().replace(/^@/, "").toLowerCase();
  return USERNAME.test(handle) ? handle : "";
}

/** A public comps amount. Status sentences and private figures are dropped. */
export function publicDollar(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (DOLLAR.test(text) || LAST_SOLD.test(text) || RANGE.test(text)) return text;
  return "";
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

export function profileShareImage(preview: LinkPreview, kicker: string): ShareImage {
  return {
    ...blank(),
    kind: "profile",
    kicker,
    title: clipText(scrubPublicText(preview.title), 80) || "Profile",
    detail: clipText(scrubPublicText(preview.detail), 80),
    imageUrl: cleanImageUrl(preview.imageUrl),
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
  cards?: readonly {
    isPublic: boolean;
    name?: string | null;
    valueLabel?: string | null;
    imageUrl?: string | null;
  }[] | null;
}): ShareImage {
  const mail = input.found && input.postType === "mail_day";
  const body = input.found ? scrubPublicText(input.body, 280) : "";
  const authorHandle = input.found ? publicHandle(input.authorHandle) : "";
  const authorName = input.found ? clipText(scrubPublicText(input.authorName), 48) : "";
  const cardLines: ShareCardLine[] = [];
  let cardPhoto: string | null = null;
  if (input.found) {
    for (const card of input.cards ?? []) {
      if (!card.isPublic) continue;
      const name = clipText(scrubPublicText(card.name), 80);
      if (!name) continue;
      cardLines.push({ name, value: publicDollar(card.valueLabel) });
      if (!cardPhoto) cardPhoto = cleanImageUrl(card.imageUrl);
      if (cardLines.length >= 3) break;
    }
  }
  const photos = mail ? uniquePhotos([...(input.mailDayPhotos ?? []), input.imageUrl]) : [];
  const imageUrl = mail ? null : cleanImageUrl(input.imageUrl) || cardPhoto;
  return {
    ...blank(),
    kind: mail ? "mail" : "post",
    kicker: mail ? "MAIL DAY" : "POST",
    title: body ? clipText(body, 90) : "Post",
    detail: "",
    body: body || "Post",
    authorName,
    authorHandle,
    imageUrl,
    photos,
    cardLines,
    photoFallback: false,
  };
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
}): ShareImage {
  const player = input.found ? clipText(scrubPublicText(input.player), 48) : "";
  const year =
    (input.yearLabel ?? "").trim() ||
    (input.year != null && input.year > 0 ? String(Math.floor(input.year)) : "");
  const yearSet = input.found
    ? clipText(scrubPublicText([year, input.setBrand ?? ""].filter(Boolean).join(" ")), 64)
    : "";
  const grade = input.found ? clipText(scrubPublicText(input.grade), 32) : "";
  const imageUrl = input.found ? cleanImageUrl(input.imageUrl) : null;
  const showPrice = Boolean(input.found && input.isPublic && input.pricePublic !== false);
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
  };
}
