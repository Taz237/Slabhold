import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { LANDSCAPE, shareNode, type Canvas } from "@/components/og-share";
import { siteUrlFrom } from "@/lib/site-url";
import { cleanImageUrl, type LinkPreview } from "@/lib/social/link-preview";
import { leaderboardCacheControl } from "@/lib/leaderboard/cache";
import type { LeaderboardShareModel } from "@/lib/leaderboard/share";
import { stripUnsupportedOgText } from "@/lib/og/safe-text";
import { movingTodayCacheControl } from "@/lib/moving-today/cache";
import type { MovingTodayShareModel } from "@/lib/moving-today/share";
import { SHARE_CHART, type CollectionValueShare } from "@/lib/share/collection-value";
import {
  homeShareImage,
  profileShareImage,
  type ShareImage,
} from "@/lib/social/share-image";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

/** Shared images. Browsers revalidate; the CDN may serve a fresh or stale copy. */
export const PUBLIC_OG_CACHE_CONTROL =
  "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

/**
 * Card, post, profile and badge images. Short CDN lifetime so an edit shows
 * quickly and a card that just went private is not served for an hour.
 */
export const CARD_OG_CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=60";

/** Failed renders. Do not keep the generic image for the route's normal hour or day. */
const OG_FAILURE_CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=60";

/** Own-profile images follow the signed-in user. Do not store them on a shared CDN. */
export const PRIVATE_OG_CACHE_CONTROL = "private, no-store";

const MAX_FETCH_BYTES = 5 * 1024 * 1024;

/** iMessage and X skip big preview images. A render over this redraws with smaller photos. */
export const OG_BYTE_BUDGET = 480 * 1024;

function dataUrl(bytes: Buffer, mime: string): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function fontBytes(bytes: Buffer): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

/** Site icon (`app/apple-icon.png`), not the SVG slab outline. */
const iconSrc = dataUrl(
  readFileSync(join(process.cwd(), "app/apple-icon.png")),
  "image/png",
);

/**
 * Home preview screenshot. The ignore comment keeps the tracer from copying
 * `public/landing/2.png` into every page. The fetch fallback uses the public
 * production origin. Preview hosts are behind Deployment Protection.
 */
function readHomeShotFile(): Buffer | null {
  // Tests turn the local file off so the fetch fallback runs without renaming it.
  if (process.env.SLABHOLD_HOME_SHOT_DISK === "off") return null;
  try {
    return readFileSync(
      join(/* turbopackIgnore: true */ process.cwd(), "public", "landing", "2.png"),
    );
  } catch {
    return null;
  }
}

function isPng(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

/** Public production domain. Preview `VERCEL_URL` is not fetched. */
function deploymentOrigin(): string {
  const raw = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const host = raw?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (host) return `https://${host}`;
  return siteUrlFrom(process.env.NEXT_PUBLIC_SITE_URL);
}

let homeShotPromise: Promise<string | null> | null = null;

async function loadHomeShot(): Promise<string | null> {
  const local = readHomeShotFile();
  if (local && isPng(local)) return dataUrl(local, "image/png");
  let response: Response;
  try {
    response = await fetch(`${deploymentOrigin()}/landing/2.png`, {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return null;
  }
  let consumed = false;
  try {
    if (response.status !== 200) return null;
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!type.startsWith("image/png")) return null;
    const lengthHeader = response.headers.get("content-length");
    if (lengthHeader != null) {
      const length = Number(lengthHeader);
      if (!Number.isFinite(length) || length > MAX_FETCH_BYTES) return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    consumed = true;
    if (bytes.length === 0 || bytes.length > MAX_FETCH_BYTES || !isPng(bytes)) return null;
    return dataUrl(bytes, "image/png");
  } catch {
    return null;
  } finally {
    if (!consumed) await response.body?.cancel().catch(() => undefined);
  }
}

function homeShotSrc(): Promise<string | null> {
  if (homeShotPromise) return homeShotPromise;
  const attempt = loadHomeShot().then((src) => {
    if (!src && homeShotPromise === attempt) homeShotPromise = null;
    return src;
  });
  homeShotPromise = attempt;
  return attempt;
}

/** Drops a cached screenshot so the next render reads disk or fetches again. */
export function resetHomeShotCache(): void {
  homeShotPromise = null;
}

/**
 * Glyphs for the image renderer. These files are passed in because that
 * renderer has no system fonts — missing files show as empty boxes.
 */
const ogFonts = [
  {
    name: "Geist",
    data: fontBytes(readFileSync(join(process.cwd(), "assets/og/Geist-Regular.ttf"))),
    weight: 400 as const,
    style: "normal" as const,
  },
  {
    name: "Geist",
    data: fontBytes(readFileSync(join(process.cwd(), "assets/og/Geist-Bold.ttf"))),
    weight: 700 as const,
    style: "normal" as const,
  },
  {
    name: "Geist Mono",
    data: fontBytes(readFileSync(join(process.cwd(), "assets/og/GeistMono-Medium.ttf"))),
    weight: 500 as const,
    style: "normal" as const,
  },
];

/** Confirm a cleaned image URL. Redirects are not followed. */
export async function reachableImage(url: string | null): Promise<string | null> {
  const safe = cleanImageUrl(url);
  if (!safe) return null;
  if (safe.startsWith("data:")) return safe;
  try {
    const response = await fetch(safe, {
      redirect: "manual",
      signal: AbortSignal.timeout(3000),
    });
    try {
      if (response.type === "opaqueredirect") return null;
      if (response.status >= 300 && response.status < 400) return null;
      if (!response.ok) return null;
      const lengthHeader = response.headers.get("content-length");
      if (lengthHeader != null) {
        const length = Number(lengthHeader);
        if (!Number.isFinite(length) || length > MAX_FETCH_BYTES) return null;
      }
      const type = (response.headers.get("content-type") ?? "").toLowerCase();
      if (type && !type.startsWith("image/")) return null;
      return safe;
    } finally {
      await response.body?.cancel().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

export async function reachableImages(urls: readonly string[]): Promise<string[]> {
  const found: string[] = [];
  for (const url of urls) {
    if (found.length >= 3) break;
    const safe = await reachableImage(url);
    if (safe && !found.includes(safe)) found.push(safe);
  }
  return found;
}

/**
 * Check every image a share model draws. Unreachable photos are dropped, so
 * the design falls back (fewer slabs, text only) instead of a broken box.
 */
export async function reachableShare(model: ShareImage): Promise<ShareImage> {
  const check = async (urls: readonly string[]) => {
    const found: string[] = [];
    for (const url of urls) {
      const safe = await reachableImage(url);
      if (safe) found.push(safe);
    }
    return found;
  };
  const [imageUrl, avatarUrl, photos, postPhotos, slabSrcs] = await Promise.all([
    reachableImage(model.imageUrl),
    reachableImage(model.avatarUrl),
    check(model.photos),
    check(model.postPhotos),
    check(model.slabs.map((slab) => slab.src)),
  ]);
  return {
    ...model,
    imageUrl,
    avatarUrl,
    photos,
    postPhotos,
    slabs: model.slabs.filter((slab) => slabSrcs.includes(slab.src)),
    photoFallback: model.kind === "card" ? !imageUrl : model.photoFallback,
  };
}

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconSrc}
        alt=""
        width={56}
        height={56}
        style={{ borderRadius: 14 }}
      />
      <div
        style={{
          display: "flex",
          marginLeft: 16,
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: 3,
          color: "#c4b5fd",
        }}
      >
        SLABHOLD
      </div>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#110d1c",
        color: "#fafafa",
        fontFamily: "Geist",
      }}
    >
      {children}
    </div>
  );
}

function Left({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        flex: 1,
        height: "100%",
        padding: "56px 40px 56px 64px",
      }}
    >
      {children}
    </div>
  );
}

function PhoneShot({ src }: { src: string }) {
  return (
    <div
      style={{
        display: "flex",
        width: 360,
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        paddingRight: 52,
      }}
    >
      <div
        style={{
          display: "flex",
          width: 268,
          height: 548,
          padding: 8,
          borderRadius: 36,
          background: "#1b1530",
          border: "2px solid rgba(196,181,253,0.55)",
          boxShadow: "0 22px 48px rgba(0,0,0,0.5)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={252}
          height={532}
          style={{ objectFit: "cover", borderRadius: 28 }}
        />
      </div>
    </div>
  );
}

function lines(text: string, size: number, weight: number, color: string, clamp: number) {
  return (
    <div
      style={{
        display: "block",
        fontSize: size,
        fontWeight: weight,
        lineHeight: 1.2,
        lineClamp: clamp,
        color,
        letterSpacing: size >= 48 ? -1 : 0,
      }}
    >
      {text}
    </div>
  );
}

function respond(node: ReactNode, cacheControl = PUBLIC_OG_CACHE_CONTROL) {
  return new ImageResponse(<Frame>{node}</Frame>, {
    ...ogSize,
    fonts: ogFonts,
    headers: {
      "Cache-Control": cacheControl,
    },
  });
}

function paint(
  model: ShareImage,
  cacheControl: string,
  homeShot: string | null,
  canvas: Canvas = LANDSCAPE,
): ImageResponse {
  const designed = shareNode(model, canvas);
  if (designed) {
    return new ImageResponse(<>{designed}</>, {
      ...canvas,
      fonts: ogFonts,
      headers: { "Cache-Control": cacheControl },
    });
  }
  const send = (node: ReactNode) => respond(node, cacheControl);

  if (model.kind === "home") {
    return send(
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <Left>
          <Brand />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, color: "#a1a1aa", marginBottom: 18 }}>
              {model.kicker}
            </div>
            {lines(model.title, 76, 700, "#fafafa", 3)}
            {model.detail ? (
              <div style={{ display: "flex", marginTop: 22, fontSize: 30, color: "#e4e4e7" }}>
                {model.detail}
              </div>
            ) : null}
          </div>
        </Left>
        {homeShot ? <PhoneShot src={homeShot} /> : null}
      </div>,
    );
  }

  // Every other kind is drawn by shareNode above.
  return send(<div style={{ display: "flex", width: "100%", height: "100%" }} />);
}

function readableShareImage(model: ShareImage): ShareImage {
  const text = stripUnsupportedOgText;
  const title = text(model.title);
  const body = text(model.body);
  const fallback =
    model.kind === "card"
      ? "Card"
      : model.kind === "profile"
        ? "Profile"
        : model.kind === "badge"
          ? "Badge"
          : model.kind === "invite" || model.kind === "collection"
            ? "Slabhold"
          : model.kind === "home"
            ? title
            : "Post";
  return {
    ...model,
    kicker: text(model.kicker),
    title: title || fallback,
    detail: text(model.detail),
    body: body || title || fallback,
    authorName: text(model.authorName),
    authorHandle: text(model.authorHandle),
    player: text(model.player) || "Card",
    yearSet: text(model.yearSet),
    grade: text(model.grade),
    valueLabel: text(model.valueLabel),
    salesLabel: text(model.salesLabel),
    cardLines: model.cardLines
      .map((line) => ({ name: text(line.name), value: text(line.value) }))
      .filter((line) => line.name),
    chip: text(model.chip),
    slabs: model.slabs.map((slab) => ({
      ...slab,
      company: text(slab.company),
      grade: text(slab.grade),
      player: text(slab.player),
      line: text(slab.line),
    })),
  };
}

async function consumeOg(response: ImageResponse): Promise<ImageResponse> {
  return packOg(await ogBytes(response), response);
}

async function ogBytes(response: ImageResponse): Promise<Buffer> {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!isPng(bytes) || bytes.length < 32) throw new Error("Open Graph image was empty");
  return bytes;
}

function packOg(bytes: Buffer, response: ImageResponse): ImageResponse {
  return new Response(new Uint8Array(bytes), {
    status: response.status,
    headers: response.headers,
  }) as ImageResponse;
}

/** Photo-heavy images can run large. Redraw once with smaller photos when over budget. */
async function paintWithinBudget(
  model: ShareImage,
  cacheControl: string,
  homeShot: string | null,
  canvas: Canvas,
): Promise<ImageResponse> {
  const first = paint(model, cacheControl, homeShot, canvas);
  const bytes = await ogBytes(first);
  if (bytes.length <= OG_BYTE_BUDGET || canvas.compact || canvas.height > canvas.width) return packOg(bytes, first);
  const smaller = paint(model, cacheControl, homeShot, { ...canvas, compact: true });
  const compact = await ogBytes(smaller);
  return compact.length < bytes.length ? packOg(compact, smaller) : packOg(bytes, first);
}

/** Render a share image. Only a font-shaping failure retries without that script. */
/** A failed public image uses the short cache. A private profile image stays private. */
function ogFailureCache(cacheControl: string): string {
  return cacheControl === PRIVATE_OG_CACHE_CONTROL
    ? PRIVATE_OG_CACHE_CONTROL
    : OG_FAILURE_CACHE_CONTROL;
}

export async function renderOg(
  model: ShareImage,
  cacheControl = PUBLIC_OG_CACHE_CONTROL,
  canvas: Canvas = LANDSCAPE,
): Promise<ImageResponse> {
  const isShapingError = (e: unknown) =>
    e instanceof Error && /lookupType: \d+ - substFormat: \d+ is not yet supported/.test(e.message);
  const homeShot = model.kind === "home" ? await homeShotSrc() : null;
  try {
    return await paintWithinBudget(model, cacheControl, homeShot, canvas);
  } catch (error) {
    console.error("[og] share image render failed", { kind: model.kind, stage: "render" }, error);
    if (isShapingError(error)) {
      try {
        const stripped = readableShareImage(model);
        const shot = stripped.kind === "home" ? (homeShot ?? (await homeShotSrc())) : null;
        return await paintWithinBudget(stripped, cacheControl, shot, canvas);
      } catch (stripError) {
        console.error(
          "[og] share image render failed",
          { kind: model.kind, stage: "strip" },
          stripError,
        );
      }
    }
    return consumeOg(paint(homeShareImage(), ogFailureCache(cacheControl), await homeShotSrc()));
  }
}

export function renderProfileOg(
  preview: LinkPreview,
  kicker: string,
  cacheControl = PUBLIC_OG_CACHE_CONTROL,
  extra?: Parameters<typeof profileShareImage>[2],
) {
  return renderOg(profileShareImage(preview, kicker, extra), cacheControl);
}

export async function renderHomeOg() {
  return paint(homeShareImage(), PUBLIC_OG_CACHE_CONTROL, await homeShotSrc());
}

/** Catalog share image. Same frame, fonts, and brand as the other Open Graph cards. */
export function renderMovingTodayOg(model: MovingTodayShareModel) {
  return respond(
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <Left>
        <Brand />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 2, color: "#c4b5fd" }}>
            {(model.title || "Moving today").toUpperCase()}
          </div>
          {model.dateLabel ? (
            <div style={{ display: "flex", marginTop: 10, fontSize: 28, color: "#a1a1aa" }}>
              {model.dateLabel}
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
            {model.lines.map((line) => (
              <div
                key={`${line.name}-${line.price}-${line.sold}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 16,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontSize: 32,
                    fontWeight: 700,
                    marginRight: 24,
                    lineClamp: 1,
                  }}
                >
                  {line.name}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>{line.price}</div>
                  <div style={{ display: "flex", marginTop: 4, fontSize: 22, color: "#d4d4d8" }}>
                    {[line.move, line.sold].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Left>
    </div>,
    movingTodayCacheControl(),
  );
}

function leaderboardNode(model: LeaderboardShareModel) {
  const title = stripUnsupportedOgText(model.title) || "Leaderboard";
  const kicker = stripUnsupportedOgText(model.kicker);
  const detail = stripUnsupportedOgText(model.detail);
  const lines = model.lines
    .map((line) => ({
      place: stripUnsupportedOgText(line.place),
      name: stripUnsupportedOgText(line.name) || "Collector",
      detail: stripUnsupportedOgText(line.detail),
    }))
    .filter((line) => line.name);
  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <Left>
        <Brand />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 2, color: "#c4b5fd" }}>
            {title.toUpperCase()}
          </div>
          {kicker ? (
            <div style={{ display: "flex", marginTop: 10, fontSize: 28, color: "#a1a1aa" }}>{kicker}</div>
          ) : null}
          {detail ? (
            <div style={{ display: "flex", marginTop: 18, fontSize: 32, fontWeight: 700 }}>{detail}</div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
            {lines.map((line) => (
              <div
                key={`${line.place}-${line.name}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginTop: 16,
                }}
              >
                <div style={{ display: "flex", width: 72, fontSize: 28, color: "#c4b5fd" }}>{line.place}</div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", fontSize: 32, fontWeight: 700, lineClamp: 1 }}>{line.name}</div>
                  {line.detail ? (
                    <div style={{ display: "flex", marginTop: 4, fontSize: 22, color: "#d4d4d8" }}>
                      {line.detail}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Left>
    </div>
  );
}

/** Text and the Slabhold mark only. Arabic-script names are removed before draw. */
export async function renderLeaderboardOg(model: LeaderboardShareModel) {
  try {
    return await consumeOg(respond(leaderboardNode(model), leaderboardCacheControl()));
  } catch (error) {
    console.error("[og] leaderboard image render failed", error);
    return consumeOg(
      respond(
        leaderboardNode({ title: "Leaderboard", kicker: "", detail: "", lines: [] }),
        leaderboardCacheControl(),
      ),
    );
  }
}

/**
 * "My collection is up $X this week": 1080×1350, purple brand, the value, the
 * range change, the line, @handle and slabhold.app. Signed-in owner only.
 */
export function renderCollectionValueOg(model: CollectionValueShare, cacheControl = PRIVATE_OG_CACHE_CONTROL) {
  const tone = model.tone === "up" ? "#34d399" : model.tone === "down" ? "#fb7185" : "#a1a1aa";
  const chart = `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_CHART.width}" height="${SHARE_CHART.height}" viewBox="0 0 ${SHARE_CHART.width} ${SHARE_CHART.height}"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tone}" stop-opacity=".32"/><stop offset="1" stop-color="${tone}" stop-opacity="0"/></linearGradient></defs><path d="${model.area}" fill="url(#f)"/><path d="${model.line}" fill="none" stroke="${tone}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const chartSrc = `data:image/svg+xml;base64,${Buffer.from(chart).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 64px 64px",
          color: "#fafafa",
          fontFamily: "Geist",
          background: "radial-gradient(ellipse at top right, rgba(124,58,237,0.55), #110d1c 62%)",
        }}
      >
        <Brand />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#ddd6fe", letterSpacing: -0.5 }}>
            {stripUnsupportedOgText(model.headline)}
          </div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 132, fontWeight: 700, letterSpacing: -5 }}>
            {model.value}
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 16 }}>
            <div
              style={{
                display: "flex",
                padding: "10px 22px",
                borderRadius: 999,
                fontSize: 32,
                fontWeight: 700,
                color: tone,
                background:
                  model.tone === "up"
                    ? "rgba(52,211,153,0.14)"
                    : model.tone === "down"
                      ? "rgba(251,113,133,0.14)"
                      : "rgba(161,161,170,0.14)",
              }}
            >
              {model.change}
            </div>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws a plain img */}
        <img src={chartSrc} alt="" width={SHARE_CHART.width} height={SHARE_CHART.height} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#a1a1aa" }}>
          <div style={{ display: "flex", fontWeight: 700, color: "#fafafa" }}>{stripUnsupportedOgText(model.handle)}</div>
          <div style={{ display: "flex", fontFamily: "Geist Mono", letterSpacing: 2 }}>
            {`${model.rangeLabel} · ${model.site}`.toUpperCase()}
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, fonts: ogFonts, headers: { "Cache-Control": cacheControl } },
  );
}
