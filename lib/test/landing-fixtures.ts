import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import nextConfig from "@/next.config";
import type { CompDemo } from "@/components/landing/showcase/sample-data";
import type { FounderShowcase } from "@/lib/landing/founder";
import { landingMedia, type LandingMedia } from "@/lib/landing/media";
import type { LandingPull } from "@/lib/landing/pulls";

/*
 * Fixtures for the signed-out Home tests: made-up cards on the real photo
 * host, a made-up comp, and a temp project root whose public/landing/media
 * folder holds whichever slot files a test asks for. Nothing here is drawn
 * by the app.
 */

const require = createRequire(process.cwd() + "/package.json");
const { SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

export const PHOTOS = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos";

export function fixtureCard(id: string, playerName: string) {
  return {
    id,
    photoUrl: `${PHOTOS}/owner/${id}.jpg`,
    playerName,
    year: 2023,
    yearLabel: "2023",
    setBrand: "Fixture Set",
    grade: "PSA 10",
    gradeQualifier: "",
    certNumber: "",
    accent: "#7c5cff",
    conditionType: "graded" as const,
    grader: "PSA",
  };
}

export const FIXTURE_FOUNDER: FounderShowcase = {
  cards: [fixtureCard("a", "Top Card"), fixtureCard("b", "Next Card"), fixtureCard("c", "Third Card")],
};

export const FIXTURE_COMP: CompDemo = {
  query: "Fixture Guard 2021 Fixture Set Downtown PSA 10",
  label: "Fixture Guard · 2021 Fixture Set Downtown · PSA 10",
  photo: { src: "/_next/image?url=fixture&w=128&q=75" },
  alt: "Fixture Guard, 2021 Fixture Set Downtown, PSA 10",
  sales: [
    { price: 310, when: "2d ago" },
    { price: 299.5, when: "4d ago" },
    { price: 285, when: "today" },
  ],
  stats: { median: 300, p25: 290, p75: 308, min: 285, max: 310, count: 9 },
  basis: "Based on 9 sales",
  real: true,
};

export const FIXTURE_PULLS: LandingPull[] = [
  { cardId: "11111111-1111-4111-8111-111111111111", handle: "fixture_puller", photoUrl: `${PHOTOS}/p1/one.jpg`, label: "Fixture Rookie, 2024 Fixture Set" },
  { cardId: "22222222-2222-4222-8222-222222222222", handle: "second_puller", photoUrl: `${PHOTOS}/p2/two.jpg`, label: "Fixture Vet, 2022 Fixture Set" },
];

/** Every slot file, so a test can fill them all or pick a few. */
export const ALL_MEDIA_FILES = [
  "hero-card.avif",
  "hero-card-back.avif",
  "scan.mp4",
  "scan.webp",
  "serial.mp4",
  "serial.webp",
  "serial-macro.avif",
  "parallels.mp4",
  "parallels.webp",
  "collection.mp4",
  "collection.webp",
  "arena.mp4",
  "arena.webp",
  "share-rank.webp",
] as const;

/**
 * A temp project root with these files in public/landing/media. The files are
 * a few bytes each: only their names matter to the slot check. `json` files
 * are written as JSON.
 */
export function mediaRoot(files: readonly string[], json: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "slabhold-media-"));
  const dir = join(root, "public", "landing", "media");
  mkdirSync(dir, { recursive: true });
  for (const name of files) writeFileSync(join(dir, name), "fixture");
  for (const [name, value] of Object.entries(json)) writeFileSync(join(dir, name), JSON.stringify(value));
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

/**
 * The landing page's HTML with its lazy parts loaded (the Quick Comp panel,
 * the clip player). The first pass starts their imports; once they are in,
 * the second pass draws everything in place, the way the server sends it.
 */
export async function renderLoaded(element: ReactElement): Promise<string> {
  // jsdom has no idle callback, and the Quick Comp panel loads "once idle": idle is now.
  const host = (typeof window === "undefined" ? null : window) as unknown as { requestIdleCallback?: (run: () => void) => number } | null;
  if (host && !host.requestIdleCallback) host.requestIdleCallback = (run) => window.setTimeout(run, 0);
  let html = renderToStaticMarkup(element);
  // A skeleton or an empty phone is a lazy part still loading.
  const waiting = () => html.includes("skeleton-shimmer") || html.includes('aria-hidden="true" class="lg-phone lg-glass"');
  for (let tries = 0; tries < 50 && (tries === 0 || waiting()); tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    html = renderToStaticMarkup(element);
  }
  return html;
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
