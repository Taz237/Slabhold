import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { siteUrlFrom } from "@/lib/site-url";
import { cleanImageUrl, type LinkPreview } from "@/lib/social/link-preview";
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

/** Own-profile images follow the signed-in user. Do not store them on a shared CDN. */
export const PRIVATE_OG_CACHE_CONTROL = "private, no-store";

const MAX_FETCH_BYTES = 5 * 1024 * 1024;

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
 * `public/landing/2.png` into every page that imports this module. On Vercel
 * the file is served from the deployment, not from the function bundle.
 */
function readHomeShotFile(): Buffer | null {
  try {
    return readFileSync(
      join(/* turbopackIgnore: true */ process.cwd(), "public", "landing", "2.png"),
    );
  } catch {
    return null;
  }
}

function deploymentOrigin(): string {
  const host = process.env.VERCEL_URL?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (host) return `https://${host}`;
  return siteUrlFrom(process.env.NEXT_PUBLIC_SITE_URL);
}

let homeShotPromise: Promise<string> | null = null;

async function loadHomeShot(): Promise<string> {
  const local = readHomeShotFile();
  if (local) return dataUrl(local, "image/png");
  const response = await fetch(`${deploymentOrigin()}/landing/2.png`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Home share image is unavailable");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_FETCH_BYTES) {
    throw new Error("Home share image is unavailable");
  }
  return dataUrl(bytes, "image/png");
}

function homeShotSrc(): Promise<string> {
  if (!homeShotPromise) {
    homeShotPromise = loadHomeShot().catch((error: unknown) => {
      homeShotPromise = null;
      throw error;
    });
  }
  return homeShotPromise;
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

function LargePhoto({ src }: { src: string }) {
  return (
    <div
      style={{
        display: "flex",
        width: 440,
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        paddingRight: 48,
      }}
    >
      <div
        style={{
          display: "flex",
          borderRadius: 28,
          overflow: "hidden",
          boxShadow: "0 18px 44px rgba(0,0,0,0.45)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={360} height={480} style={{ objectFit: "cover" }} />
      </div>
    </div>
  );
}

function PhotoFallback() {
  return (
    <div
      style={{
        display: "flex",
        width: 440,
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        paddingRight: 48,
      }}
    >
      <div
        style={{
          display: "flex",
          width: 360,
          height: 480,
          borderRadius: 28,
          background: "#2e1065",
          border: "2px solid rgba(196,181,253,0.45)",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconSrc} alt="" width={96} height={96} style={{ borderRadius: 24 }} />
        <div
          style={{
            display: "flex",
            marginTop: 22,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 3,
            color: "#c4b5fd",
          }}
        >
          SLABHOLD
        </div>
      </div>
    </div>
  );
}

function Fan({ photos }: { photos: string[] }) {
  const tilts = photos.length === 2 ? [-8, 8] : [-12, 0, 12];
  const width = photos.length === 1 ? 280 : photos.length === 2 ? 210 : 176;
  const height = photos.length === 1 ? 380 : photos.length === 2 ? 286 : 246;
  return (
    <div
      style={{
        display: "flex",
        width: 520,
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        paddingRight: 36,
      }}
    >
      {photos.map((src, index) => (
        <div
          key={`${index}-${src.slice(0, 24)}`}
          style={{
            display: "flex",
            marginLeft: index === 0 ? 0 : photos.length === 3 ? -48 : -36,
            transform: `rotate(${tilts[index] ?? 0}deg)`,
            borderRadius: 22,
            overflow: "hidden",
            border: "3px solid rgba(255,255,255,0.18)",
            boxShadow: "0 16px 36px rgba(0,0,0,0.45)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" width={width} height={height} style={{ objectFit: "cover" }} />
        </div>
      ))}
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
): ImageResponse {
  const send = (node: ReactNode) => respond(node, cacheControl);
  const imageUrl = cleanImageUrl(model.imageUrl);
  const photos = model.photos
    .map((url) => cleanImageUrl(url))
    .filter((url): url is string => Boolean(url))
    .slice(0, 3);

  if (model.kind === "home") {
    if (!homeShot) throw new Error("Home share image is unavailable");
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
        <PhoneShot src={homeShot} />
      </div>,
    );
  }

  if (model.kind === "card") {
    return send(
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <Left>
          <Brand />
          <div style={{ display: "flex", flexDirection: "column" }}>
            {lines(model.player || "Card", 58, 700, "#fafafa", 2)}
            {model.yearSet ? (
              <div style={{ display: "flex", marginTop: 16, fontSize: 30, color: "#e4e4e7" }}>
                {model.yearSet}
              </div>
            ) : null}
            {model.grade ? (
              <div style={{ display: "flex", marginTop: 8, fontSize: 28, color: "#c4b5fd" }}>
                {model.grade}
              </div>
            ) : null}
            {model.showValue && model.valueLabel ? (
              <div style={{ display: "flex", flexDirection: "column", marginTop: 32 }}>
                <div
                  style={{
                    display: "flex",
                    fontSize: 64,
                    fontWeight: 700,
                    letterSpacing: -1,
                  }}
                >
                  {model.valueLabel}
                </div>
                {model.salesLabel ? (
                  <div style={{ display: "flex", marginTop: 10, fontSize: 26, color: "#a1a1aa" }}>
                    {model.salesLabel}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Left>
        {imageUrl ? <LargePhoto src={imageUrl} /> : <PhotoFallback />}
      </div>,
    );
  }

  const side =
    model.kind === "mail" && photos.length > 0 ? (
      <Fan photos={photos} />
    ) : imageUrl ? (
      <LargePhoto src={imageUrl} />
    ) : model.photoFallback ? (
      <PhotoFallback />
    ) : null;

  return send(
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <Left>
        <Brand />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {model.kind === "profile" ? (
            <div style={{ display: "flex", fontSize: 22, color: "#a1a1aa", marginBottom: 16 }}>
              {model.kicker}
            </div>
          ) : null}
          {model.authorName || model.authorHandle ? (
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 18 }}>
              {model.authorName ? (
                <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>{model.authorName}</div>
              ) : null}
              {model.authorHandle ? (
                <div
                  style={{
                    display: "flex",
                    marginTop: model.authorName ? 6 : 0,
                    fontSize: 26,
                    color: "#c4b5fd",
                  }}
                >
                  @{model.authorHandle}
                </div>
              ) : null}
            </div>
          ) : null}
          {model.kind === "profile"
            ? lines(model.title, model.title.length > 42 ? 52 : 64, 700, "#fafafa", 3)
            : lines(model.body || model.title, 46, 700, "#fafafa", 3)}
          {model.kind === "profile" && model.detail ? (
            <div style={{ display: "flex", marginTop: 22, fontSize: 32, color: "#e4e4e7" }}>
              {model.detail}
            </div>
          ) : null}
          {model.cardLines.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 26 }}>
              {model.cardLines.map((line, index) => (
                <div
                  key={`${index}-${line.name}`}
                  style={{ display: "flex", flexDirection: "column", marginTop: 8 }}
                >
                  <div style={{ display: "flex", fontSize: 24, color: "#d4d4d8" }}>{line.name}</div>
                  {line.value ? (
                    <div
                      style={{
                        display: "flex",
                        marginTop: 4,
                        fontSize: 32,
                        fontWeight: 700,
                        color: "#c4b5fd",
                      }}
                    >
                      {line.value}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Left>
      {side}
    </div>,
  );
}

export function renderOg(
  model: ShareImage,
  cacheControl = PUBLIC_OG_CACHE_CONTROL,
): ImageResponse | Promise<ImageResponse> {
  if (model.kind !== "home") return paint(model, cacheControl, null);
  return homeShotSrc().then((src) => paint(model, cacheControl, src));
}

export function renderProfileOg(
  preview: LinkPreview,
  kicker: string,
  cacheControl = PUBLIC_OG_CACHE_CONTROL,
) {
  return paint(profileShareImage(preview, kicker), cacheControl, null);
}

export async function renderHomeOg() {
  return paint(homeShareImage(), PUBLIC_OG_CACHE_CONTROL, await homeShotSrc());
}
