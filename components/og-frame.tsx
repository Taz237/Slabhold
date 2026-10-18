import { ImageResponse } from "next/og";
import { clipText, type LinkPreview } from "@/lib/social/link-preview";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export async function reachableImage(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:image/")) return url;
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (type && !type.startsWith("image/")) return null;
    return url;
  } catch {
    return null;
  }
}

export function renderOg(preview: LinkPreview, kicker: string) {
  const title = clipText(preview.title, 90);
  const detail = clipText(preview.detail, 80);
  const titleSize = title.length > 70 ? 40 : title.length > 42 ? 52 : 64;

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
        {preview.imageUrl ? (
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
              src={preview.imageUrl}
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
