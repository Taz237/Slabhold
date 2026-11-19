import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * The landing page's real media, looked up on the server only (node:fs, so it
 * can't be bundled for the browser). Each slot is a file with an exact name
 * in public/landing/media/. A slot with no file is null and the page draws no
 * media for it: nothing generated, nothing placeholder. Dropping the files in
 * and redeploying is all it takes to fill a slot (see that folder's README).
 */

export const MEDIA_DIR = "landing/media";

/** Phone recordings, portrait. */
export const VIDEO_SIZE = { width: 720, height: 1560 } as const;
/** Card photos and other stills. */
export const STILL_SIZE = { width: 1280, height: 1792 } as const;

export type MediaSlot = { src: string; poster: string | null; width: number; height: number };

/** Approved public pulls. Only the handle and the public card's id. */
export type PullRef = { handle: string; cardId: string };

/** Real facts about the hero card, from sizes.json. Each is drawn only when given. */
export type HeroCardFacts = { alt: string; serial: string };

export type LandingMedia = {
  heroCard: MediaSlot | null;
  heroCardBack: MediaSlot | null;
  heroCardFacts: HeroCardFacts;
  scan: MediaSlot | null;
  serial: MediaSlot | null;
  serialMacro: MediaSlot | null;
  parallels: MediaSlot | null;
  collection: MediaSlot | null;
  arena: MediaSlot | null;
  shareRank: MediaSlot | null;
  pulls: PullRef[] | null;
};

export const EMPTY_MEDIA: LandingMedia = {
  heroCard: null,
  heroCardBack: null,
  heroCardFacts: { alt: "", serial: "" },
  scan: null,
  serial: null,
  serialMacro: null,
  parallels: null,
  collection: null,
  arena: null,
  shareRank: null,
  pulls: null,
};

/** Every slot's files, for the README and the tests. */
export const MEDIA_FILES = {
  heroCard: "hero-card.avif",
  heroCardBack: "hero-card-back.avif",
  scan: "scan.mp4",
  scanPoster: "scan.webp",
  serial: "serial.mp4",
  serialPoster: "serial.webp",
  serialMacro: "serial-macro.avif",
  parallels: "parallels.mp4",
  parallelsPoster: "parallels.webp",
  collection: "collection.mp4",
  collectionPoster: "collection.webp",
  arena: "arena.mp4",
  arenaPoster: "arena.webp",
  shareRank: "share-rank.webp",
  pulls: "pulls.json",
  sizes: "sizes.json",
} as const;

type Sidecar = Record<string, { width?: unknown; height?: unknown; alt?: unknown; serial?: unknown }>;

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** A handle and a card id, or nothing. Anything else in the file is dropped. */
function readPulls(value: unknown): PullRef[] {
  if (!Array.isArray(value)) return [];
  const pulls: PullRef[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { handle, cardId } = item as { handle?: unknown; cardId?: unknown };
    if (typeof handle !== "string" || typeof cardId !== "string") continue;
    if (!/^[a-z0-9_]{1,32}$/i.test(handle) || !/^[0-9a-f-]{8,64}$/i.test(cardId)) continue;
    pulls.push({ handle, cardId });
  }
  return pulls.slice(0, 24);
}

/**
 * Which slots have a real file right now. `root` is the project root (the
 * folder that holds public/); tests point it at a temp folder.
 */
export function landingMedia(root: string = process.cwd()): LandingMedia {
  const dir = join(/* turbopackIgnore: true */ root, "public", MEDIA_DIR);
  if (!existsSync(dir)) return EMPTY_MEDIA;
  const at = (name: string) => join(/* turbopackIgnore: true */ dir, name);
  const has = (name: string) => existsSync(at(name));
  const sidecar = has(MEDIA_FILES.sizes) ? ((readJson(at(MEDIA_FILES.sizes)) ?? {}) as Sidecar) : {};
  const url = (name: string) => `/${MEDIA_DIR}/${name}`;

  function size(name: string, fallback: { width: number; height: number }) {
    const given = sidecar && typeof sidecar === "object" ? sidecar[name] : undefined;
    return {
      width: positive(given?.width) ?? fallback.width,
      height: positive(given?.height) ?? fallback.height,
    };
  }

  function still(name: string): MediaSlot | null {
    return has(name) ? { src: url(name), poster: null, ...size(name, STILL_SIZE) } : null;
  }

  /** A clip needs its poster too: the poster is what paints before it plays. */
  function clip(name: string, poster: string): MediaSlot | null {
    return has(name) && has(poster) ? { src: url(name), poster: url(poster), ...size(name, VIDEO_SIZE) } : null;
  }

  const heroCard = still(MEDIA_FILES.heroCard);
  const facts = heroCard ? sidecar[MEDIA_FILES.heroCard] : undefined;
  const pulls = has(MEDIA_FILES.pulls) ? readPulls(readJson(at(MEDIA_FILES.pulls))) : [];

  return {
    heroCard,
    heroCardBack: heroCard ? still(MEDIA_FILES.heroCardBack) : null,
    heroCardFacts: { alt: text(facts?.alt, 140), serial: text(facts?.serial, 16) },
    scan: clip(MEDIA_FILES.scan, MEDIA_FILES.scanPoster),
    serial: clip(MEDIA_FILES.serial, MEDIA_FILES.serialPoster),
    serialMacro: still(MEDIA_FILES.serialMacro),
    parallels: clip(MEDIA_FILES.parallels, MEDIA_FILES.parallelsPoster),
    collection: clip(MEDIA_FILES.collection, MEDIA_FILES.collectionPoster),
    arena: clip(MEDIA_FILES.arena, MEDIA_FILES.arenaPoster),
    shareRank: still(MEDIA_FILES.shareRank),
    pulls: pulls.length ? pulls : null,
  };
}
