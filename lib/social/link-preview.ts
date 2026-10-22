/** Share-card copy. Private cards never contribute a name, photo, or value. */

export type LinkPreview = {
  title: string;
  description: string;
  imageUrl: string | null;
  /** Second line on the share image. Empty when there is nothing public to add. */
  detail: string;
};

const PRIVATE_CARD: LinkPreview = {
  title: "Private card",
  description: "This card isn't public on Slabhold.",
  imageUrl: null,
  detail: "",
};

/** Graphemes, so a cut never splits an emoji into a lone surrogate. */
function textGraphemes(value: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (typeof Segmenter === "function") {
    return [...new Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map(
      (part) => part.segment,
    );
  }
  return Array.from(value);
}

export function clipText(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  const parts = textGraphemes(text);
  if (parts.length <= max) return text;
  return `${parts.slice(0, Math.max(1, max - 1)).join("").trimEnd()}…`;
}

const MAX_DATA_BYTES = 2 * 1024 * 1024;
const MAX_DATA_URL_CHARS = 3 * 1024 * 1024;
const DATA_IMAGE =
  /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i;

function supabaseStorageHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

function dataImageUrl(value: string): string | null {
  if (value.length > MAX_DATA_URL_CHARS) return null;
  const match = DATA_IMAGE.exec(value);
  if (!match) return null;
  const payload = match[2];
  if (payload.length % 4 !== 0) return null;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const bytes = (payload.length / 4) * 3 - padding;
  if (bytes <= 0 || bytes > MAX_DATA_BYTES) return null;
  return value;
}

function storageImageUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  const host = supabaseStorageHost();
  if (!host || parsed.host !== host) return null;
  if (!parsed.pathname.startsWith("/storage/v1/object/public/")) return null;
  return value;
}

/**
 * Share images are a small png/jpeg/webp/gif data URL, or an https object in
 * this project's public Supabase storage. Every other URL is dropped.
 */
export function cleanImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const value = url.trim();
  if (value.startsWith("data:")) return dataImageUrl(value);
  return storageImageUrl(value);
}

export function collectionSizeLabel(count: number): string {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return safe === 1 ? "1 card" : `${safe} cards`;
}

/**
 * Public cards show the name, photo, and value.
 * A private or missing card returns the same generic card with none of those.
 */
export function cardLinkPreview(input: {
  isPublic: boolean;
  name?: string | null;
  imageUrl?: string | null;
  valueLabel?: string | null;
}): LinkPreview {
  if (!input.isPublic) return { ...PRIVATE_CARD };
  const name = clipText(input.name?.trim() || "Card", 140);
  const value = input.valueLabel?.replace(/\s+/g, " ").trim() || "";
  return {
    title: name,
    description: value ? `${name} · ${value}` : `${name} on Slabhold.`,
    imageUrl: cleanImageUrl(input.imageUrl),
    detail: value,
  };
}

/** Username plus the public collection count. There is no private-count field. */
export function profileLinkPreview(input: {
  found: boolean;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  publicCardCount?: number | null;
}): LinkPreview {
  const username = input.username?.trim().replace(/^@/, "") || "";
  if (!input.found || !username) {
    return {
      title: "Profile",
      description: "Collectors on Slabhold.",
      imageUrl: null,
      detail: "",
    };
  }
  const display = input.displayName?.replace(/\s+/g, " ").trim() || "";
  const title = display || `@${username}`;
  const count =
    input.publicCardCount == null || !Number.isFinite(input.publicCardCount)
      ? null
      : Math.max(0, Math.floor(input.publicCardCount));
  const size = count == null ? "" : collectionSizeLabel(count);
  return {
    title: clipText(title, 80),
    description: size ? `@${username} · ${size}` : `@${username} on Slabhold.`,
    imageUrl: cleanImageUrl(input.avatarUrl),
    detail: size,
  };
}

/**
 * Post previews are the post text.
 * A card photo is used only when that card is public and the post has no photo of its own.
 */
export function postPreviewImage(input: {
  postImageUrl?: string | null;
  cardImageUrl?: string | null;
  cardIsPublic: boolean;
}): string | null {
  const postImage = cleanImageUrl(input.postImageUrl);
  if (postImage) return postImage;
  if (!input.cardIsPublic) return null;
  return cleanImageUrl(input.cardImageUrl);
}

export function postLinkPreview(input: {
  found: boolean;
  body?: string | null;
  imageUrl?: string | null;
  /** Public card line. Empty when the post has no public card name. */
  mailDayTitle?: string | null;
}): LinkPreview {
  if (!input.found) {
    return {
      title: "Post",
      description: "A post on Slabhold.",
      imageUrl: null,
      detail: "",
    };
  }
  const mailDay = input.mailDayTitle?.replace(/\s+/g, " ").trim() || "";
  if (mailDay) {
    return {
      title: clipText(mailDay, 140),
      description: clipText(mailDay, 180),
      imageUrl: cleanImageUrl(input.imageUrl),
      detail: "",
    };
  }
  const text = input.body?.replace(/\s+/g, " ").trim() || "";
  if (!text) {
    return {
      title: "Post",
      description: "A post on Slabhold.",
      imageUrl: cleanImageUrl(input.imageUrl),
      detail: "",
    };
  }
  return {
    title: clipText(text, 90),
    description: clipText(text, 220),
    imageUrl: cleanImageUrl(input.imageUrl),
    detail: "",
  };
}

export function previewMetadata(preview: LinkPreview) {
  const title = /slabhold/i.test(preview.title)
    ? preview.title
    : `${preview.title} · Slabhold`;
  return {
    title,
    description: preview.description,
    openGraph: {
      title: preview.title,
      description: preview.description,
      siteName: "Slabhold",
    },
    twitter: {
      card: "summary_large_image" as const,
      title: preview.title,
      description: preview.description,
    },
  };
}
