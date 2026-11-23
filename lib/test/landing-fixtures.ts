import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import nextConfig from "@/next.config";
import { SCREEN_FILES, landingMedia, type LandingMedia } from "@/lib/landing/media";
import type { LandingPost } from "@/lib/landing/timeline";

/*
 * Fixtures for the signed-out Home tests: made-up posts on the real photo
 * host, and a temp project root whose public/landing folder holds whichever
 * hero and screen files a test asks for. Nothing here is drawn by the app.
 */

const require = createRequire(process.cwd() + "/package.json");
const { SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

export const STORAGE = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public";

/** Three made-up public posts, already shaped the way the server read shapes them. */
export const FIXTURE_POSTS: LandingPost[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    handle: "fixture_puller",
    name: "Fixture Puller",
    avatarUrl: `${STORAGE}/avatars/p1/me.jpg`,
    text: "Pulled this one out of a blaster tonight.",
    photoUrl: `${STORAGE}/post-images/p1/one.jpg`,
    photoKind: "photo",
    cardLabel: "",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    handle: "second_collector",
    name: "Second Collector",
    avatarUrl: null,
    text: "New pickup for the rookie binder.",
    photoUrl: `${STORAGE}/card-photos/p2/two.jpg`,
    photoKind: "card",
    cardLabel: "Fixture Rookie · 2024 Fixture Set",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    handle: "third_collector",
    name: "Third Collector",
    avatarUrl: null,
    text: "",
    photoUrl: `${STORAGE}/post-images/p3/three.jpg`,
    photoKind: "photo",
    cardLabel: "",
  },
];

/** Every screen still's file name. */
export const ALL_SCREEN_FILES: readonly string[] = Object.values(SCREEN_FILES);

/** The smallest PNG a size reader accepts: the signature and an IHDR with this size. */
export function pngBytes(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}

/**
 * A temp project root with these files in public/landing/screens, and the
 * hero card photo when asked for. A .png is a tiny real PNG header (1170 by
 * 2532); anything else is a few bytes: only its name matters to the slot check.
 */
export function mediaRoot(files: readonly string[], { hero = false }: { hero?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "slabhold-media-"));
  const dir = join(root, "public", "landing", "screens");
  mkdirSync(dir, { recursive: true });
  for (const name of files) writeFileSync(join(dir, name), name.endsWith(".png") ? pngBytes(1170, 2532) : "fixture");
  if (hero) writeFileSync(join(root, "public", "landing", "hero-card.jpg"), "fixture");
  return {
    root,
    media: (): LandingMedia => landingMedia(root),
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** The contexts the landing page reads when drawn outside Next: image options, ?next= and a router. */
export function withLandingContexts(children: ReactNode, search = "", prefetch: (href: string) => void = () => {}) {
  const router = { back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch };
  return createElement(
    ImageConfigContext.Provider,
    { value: { ...imageConfigDefault, ...nextConfig.images } },
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(SearchParamsContext.Provider, { value: new URLSearchParams(search) }, children),
    ),
  );
}

/** Visible text of some HTML: tags out, entities for the apostrophe and the middle dot back in. */
export function htmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** Every word a visitor can read or hear: the text plus alt text and accessible names. */
export function htmlWords(html: string): string {
  const named = [...html.matchAll(/(?:alt|aria-label|title)="([^"]*)"/g)].map((match) => match[1]);
  return [htmlText(html), ...named].join("\n").replace(/&#x27;/g, "'");
}
