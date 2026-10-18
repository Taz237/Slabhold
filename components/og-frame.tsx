import { ImageResponse } from "next/og";
import { cleanImageUrl, clipText, type LinkPreview } from "@/lib/social/link-preview";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

const MAX_FETCH_BYTES = 5 * 1024 * 1024;

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

export function renderOg(preview: LinkPreview, kicker: string) {
  const title = clipText(preview.title, 90);
  const detail = clipText(preview.detail, 80);
  const titleSize = title.length > 70 ? 40 : title.length > 42 ? 52 : 64;
  const imageUrl = cleanImageUrl(preview.imageUrl);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#110d1c",
          color: "#fafafa",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            padding: "64px",
          }}
        >
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 3, color: "#c4b5fd" }}>
            SLABHOLD
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, color: "#a1a1aa", marginBottom: 16 }}>
              {kicker}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: titleSize,
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: -1,
              }}
            >
              {title}
            </div>
            {detail ? (
              <div style={{ display: "flex", marginTop: 24, fontSize: 34, color: "#e4e4e7" }}>
                {detail}
              </div>
            ) : null}
          </div>
        </div>
        {imageUrl ? (
          <div
            style={{
              display: "flex",
              width: 460,
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              padding: 48,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              width={360}
              height={480}
              style={{ objectFit: "cover", borderRadius: 28 }}
            />
          </div>
        ) : null}
      </div>
    ),
    { ...ogSize },
  );
}
