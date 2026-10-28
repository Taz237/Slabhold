import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CSSProperties, ReactNode } from "react";
import { BADGE_TIERS, type BadgeCategory, type BadgeTier } from "@/lib/badges/config";
import { fitQuote } from "@/lib/og/fit";
import { initials } from "@/lib/format";
import { postLayout, type ShareBadge, type ShareImage, type ShareSlab } from "@/lib/social/share-image";

/** Brand only: Geist on near-black, with the three Slabhold purples. */
const C = {
  bg: "#09090B",
  ink: "#18181B",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  accent: "#A78BFA",
  purple: "#7C3AED",
  deep: "#5B21B6",
};

const MONO = "Geist Mono";

function svgData(bytes: Buffer): string {
  return `data:image/svg+xml;base64,${bytes.toString("base64")}`;
}

/** `public/logo.svg`, the purple star tile. */
const logoSrc = svgData(readFileSync(join(process.cwd(), "public/logo.svg")));

/** Static paths, one per file, so the output tracer copies every badge SVG. */
const FRAMES: Record<BadgeTier, string> = {
  bronze: svgData(readFileSync(join(process.cwd(), "public/badges/frames/frame-bronze.svg"))),
  silver: svgData(readFileSync(join(process.cwd(), "public/badges/frames/frame-silver.svg"))),
  gold: svgData(readFileSync(join(process.cwd(), "public/badges/frames/frame-gold.svg"))),
  platinum: svgData(readFileSync(join(process.cwd(), "public/badges/frames/frame-platinum.svg"))),
  diamond: svgData(readFileSync(join(process.cwd(), "public/badges/frames/frame-diamond.svg"))),
  legendary: svgData(readFileSync(join(process.cwd(), "public/badges/frames/frame-legendary.svg"))),
};

const ICONS: Record<BadgeCategory, string> = {
  collector: svgData(readFileSync(join(process.cwd(), "public/badges/icons/icon-collector.svg"))),
  streak: svgData(readFileSync(join(process.cwd(), "public/badges/icons/icon-streak.svg"))),
  "rainbow-chaser": svgData(readFileSync(join(process.cwd(), "public/badges/icons/icon-rainbow-chaser.svg"))),
  "slab-king": svgData(readFileSync(join(process.cwd(), "public/badges/icons/icon-slab-king.svg"))),
  "voice-of-the-hobby": svgData(readFileSync(join(process.cwd(), "public/badges/icons/icon-voice-of-the-hobby.svg"))),
  following: svgData(readFileSync(join(process.cwd(), "public/badges/icons/icon-following.svg"))),
  leaderboard: svgData(readFileSync(join(process.cwd(), "public/badges/icons/icon-leaderboard.svg"))),
  limited: svgData(readFileSync(join(process.cwd(), "public/badges/icons/icon-limited.svg"))),
};

/** `compact` draws photos smaller. Used once when a render runs over the size budget. */
export type Canvas = { width: number; height: number; compact?: boolean };

function heroScale(canvas: Canvas): number {
  return canvas.compact ? 0.78 : 1;
}

export const LANDSCAPE: Canvas = { width: 1200, height: 630 };
export const PORTRAIT: Canvas = { width: 1080, height: 1350 };

const row: CSSProperties = { display: "flex", alignItems: "center" };
const col: CSSProperties = { display: "flex", flexDirection: "column" };

/** A soft purple light. Drawn across the whole canvas so it never ends in a hard edge. */
function Glow({ size, x, y, strength = 0.5 }: { size: number; x: number; y: number; strength?: number }) {
  const r = size / 2;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundImage: `radial-gradient(circle at ${x}px ${y}px, rgba(124,58,237,${strength}) 0px, rgba(91,33,182,${(strength * 0.45).toFixed(3)}) ${Math.round(r * 0.55)}px, rgba(9,9,11,0) ${Math.round(r)}px)`,
      }}
    />
  );
}

function Logo({ size }: { size: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logoSrc} alt="" width={size} height={size} />;
}

/** Small logo plus "slabhold.app". */
function Footer({ size = 36 }: { size?: number }) {
  return (
    <div style={row}>
      <Logo size={size} />
      <div
        style={{
          display: "flex",
          marginLeft: size * 0.36,
          fontFamily: MONO,
          fontSize: size * 0.62,
          letterSpacing: 1,
          color: C.muted,
        }}
      >
        slabhold.app
      </div>
    </div>
  );
}

function Avatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  const ring: CSSProperties = {
    display: "flex",
    width: size,
    height: size,
    borderRadius: size,
    border: `${Math.max(2, size * 0.04)}px solid rgba(167,139,250,0.55)`,
    overflow: "hidden",
    flexShrink: 0,
  };
  if (src) {
    return (
      <div style={ring}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={size} height={size} style={{ objectFit: "cover" }} />
      </div>
    );
  }
  return (
    <div
      style={{
        ...ring,
        alignItems: "center",
        justifyContent: "center",
        backgroundImage: `linear-gradient(135deg, ${C.purple}, ${C.deep})`,
        fontSize: size * 0.4,
        fontWeight: 700,
        color: C.text,
      }}
    >
      {initials(name) || "S"}
    </div>
  );
}

function Author({ model, size = 60 }: { model: ShareImage; size?: number }) {
  // A missing or hidden post has no author to show.
  if (!model.authorName && !model.authorHandle) return <Footer size={size * 0.7} />;
  const name = model.authorName || `@${model.authorHandle}`;
  return (
    <div style={row}>
      <Avatar src={model.avatarUrl} name={name} size={size} />
      <div style={{ ...col, marginLeft: size * 0.3, minWidth: 0 }}>
        <div style={{ display: "flex", fontSize: size * 0.48, fontWeight: 700, color: C.text, letterSpacing: -0.5 }}>
          {name}
        </div>
        {model.authorHandle && model.authorName ? (
          <div style={{ display: "flex", marginTop: 2, fontSize: size * 0.36, color: C.accent }}>
            @{model.authorHandle}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Chip({ text, size = 19, maxWidth }: { text: string; size?: number; maxWidth: number }) {
  return (
    <div
      style={{
        display: "flex",
        maxWidth,
        padding: `${size * 0.5}px ${size * 0.9}px`,
        borderRadius: 999,
        border: "1.5px solid rgba(167,139,250,0.4)",
        backgroundColor: "rgba(124,58,237,0.16)",
        fontFamily: MONO,
        fontSize: size,
        letterSpacing: 1.2,
        color: C.accent,
      }}
    >
      <div style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</div>
    </div>
  );
}

/**
 * The in-app slab: a clear acrylic case, a light label with the grade for
 * graded cards, the photo inside. No grader logos, no team marks.
 */
function Slab({ slab, width }: { slab: ShareSlab | null; width: number }) {
  const pad = Math.round(width * 0.05);
  const inner = width - pad * 2;
  const photoHeight = Math.round(inner * 1.4);
  const label = slab?.graded ? (
    <div
      style={{
        ...row,
        justifyContent: "space-between",
        marginBottom: pad * 0.8,
        padding: `${width * 0.03}px ${width * 0.045}px`,
        borderRadius: width * 0.03,
        backgroundColor: C.text,
        color: C.ink,
      }}
    >
      <div style={{ ...col, flex: 1, minWidth: 0, marginRight: width * 0.03 }}>
        <div
          style={{
            display: "block",
            fontFamily: MONO,
            fontSize: Math.max(10, width * 0.04),
            letterSpacing: 0.8,
            color: "#52525B",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {(slab.line || "Graded card").toUpperCase()}
        </div>
        <div
          style={{
            display: "block",
            marginTop: 2,
            fontSize: Math.max(12, width * 0.058),
            fontWeight: 700,
            letterSpacing: -0.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {(slab.player || "Card").toUpperCase()}
        </div>
      </div>
      <div style={{ ...col, alignItems: "flex-end" }}>
        <div style={{ display: "flex", fontFamily: MONO, fontSize: Math.max(10, width * 0.04), color: C.deep }}>
          {(slab.company || "GRADED").toUpperCase()}
        </div>
        <div style={{ display: "flex", fontSize: width * 0.1, lineHeight: 1, fontWeight: 700, color: C.deep }}>
          {slab.grade || "—"}
        </div>
      </div>
    </div>
  ) : null;
  return (
    <div
      style={{
        ...col,
        width,
        padding: pad,
        borderRadius: width * 0.06,
        border: "2px solid rgba(255,255,255,0.3)",
        backgroundImage: "linear-gradient(160deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.07) 45%, rgba(255,255,255,0.12) 100%)",
        boxShadow: "0 28px 60px rgba(0,0,0,0.6)",
      }}
    >
      {label}
      {slab ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slab.src}
          alt=""
          width={inner}
          height={photoHeight}
          style={{ objectFit: "cover", borderRadius: width * 0.02 }}
        />
      ) : (
        <div
          style={{
            ...col,
            width: inner,
            height: photoHeight,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: width * 0.02,
            backgroundImage: `linear-gradient(160deg, ${C.purple} 0%, ${C.deep} 50%, ${C.bg} 100%)`,
          }}
        >
          <Logo size={inner * 0.34} />
        </div>
      )}
    </div>
  );
}

/** Height of a slab drawn at this width, label included. */
function slabHeight(slab: ShareSlab | null, width: number): number {
  const pad = Math.round(width * 0.05);
  const photo = Math.round((width - pad * 2) * 1.4);
  const label = slab?.graded ? width * 0.06 + width * 0.04 + width * 0.058 + 6 + pad * 0.8 : 0;
  return pad * 2 + photo + label + 4;
}

function Photo({ src, width, height }: { src: string; width: number; height: number }) {
  return (
    <div
      style={{
        display: "flex",
        borderRadius: 28,
        overflow: "hidden",
        border: "2px solid rgba(255,255,255,0.14)",
        boxShadow: "0 28px 60px rgba(0,0,0,0.6)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={width} height={height} style={{ objectFit: "cover" }} />
    </div>
  );
}

/** Up to three items, tilted, the middle one on top. */
function Fan({ items, box }: { items: ReactNode[]; box: { width: number; height: number; item: number } }) {
  const count = Math.min(3, items.length);
  const tilts = count === 2 ? [-7, 7] : [-11, 0, 11];
  const step = count === 2 ? box.item * 0.5 : box.item * 0.52;
  const order = count === 3 ? [0, 2, 1] : [0, 1];
  return (
    <div style={{ display: "flex", position: "relative", width: box.width, height: box.height }}>
      {order.slice(0, count).map((index) => {
        const offset = (index - (count - 1) / 2) * step;
        return (
          <div
            key={index}
            style={{
              display: "flex",
              position: "absolute",
              left: box.width / 2 - box.item / 2 + offset,
              top: count === 3 && index === 1 ? 0 : box.height * 0.05,
              transform: `rotate(${tilts[index] ?? 0}deg)`,
            }}
          >
            {items[index]}
          </div>
        );
      })}
    </div>
  );
}

function Badge({ badge, size }: { badge: ShareBadge; size: number }) {
  const icon = size * 0.379;
  const inset = (size - icon) / 2;
  return (
    <div style={{ display: "flex", position: "relative", width: size, height: size, flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={FRAMES[badge.tier]} alt="" width={size} height={size} style={{ position: "absolute", left: 0, top: 0 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ICONS[badge.category]} alt="" width={icon} height={icon} style={{ position: "absolute", left: inset, top: inset }} />
    </div>
  );
}

function Stage({ canvas, children }: { canvas: Canvas; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: canvas.width,
        height: canvas.height,
        backgroundColor: C.bg,
        color: C.text,
        fontFamily: "Geist",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

/** Faint brand pattern: a dot grid, fading out toward the text side. */
function Pattern({ canvas }: { canvas: Canvas }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><defs><pattern id="d" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="16" cy="16" r="1.6" fill="#A78BFA"/></pattern><linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".22"/></linearGradient><mask id="m"><rect width="100%" height="100%" fill="url(#f)"/></mask></defs><rect width="100%" height="100%" fill="url(#d)" mask="url(#m)"/></svg>`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
      alt=""
      width={canvas.width}
      height={canvas.height}
      style={{ position: "absolute", left: 0, top: 0 }}
    />
  );
}

function Watermark({ size, x, y }: { size: number; x: number; y: number }) {
  return (
    <div style={{ display: "flex", position: "absolute", left: x, top: y, opacity: 0.08, transform: "rotate(-12deg)" }}>
      <Logo size={size} />
    </div>
  );
}

function Quote({ text, box, color = C.text }: { text: string; box: { width: number; height: number; maxLines?: number; sizes?: number[] }; color?: string }) {
  const fit = fitQuote(text, box);
  return (
    <div
      style={{
        display: "flex",
        width: box.width,
        fontSize: fit.fontSize,
        lineHeight: fit.lineHeight,
        fontWeight: 700,
        letterSpacing: fit.fontSize >= 48 ? -1.2 : -0.4,
        color,
      }}
    >
      {fit.text}
    </div>
  );
}

// Posts

function postHero(model: ShareImage, canvas: Canvas): { node: ReactNode; width: number } | null {
  const layout = postLayout(model);
  const height = canvas.height;
  const k = heroScale(canvas);
  if (layout === "slab") {
    const slab = model.slabs[0] ?? null;
    let width = Math.round(300 * k);
    while (slabHeight(slab, width) > height - 70 && width > 200) width -= 10;
    return { node: <Slab slab={slab} width={width} />, width: 470 };
  }
  if (layout === "photo") {
    const src = model.kind === "mail" ? model.photos[0] : model.postPhotos[0];
    return src ? { node: <Photo src={src} width={Math.round(360 * k)} height={Math.round(450 * k)} />, width: 480 } : null;
  }
  if (layout === "fan-slabs") {
    const width = Math.round((model.slabs.length >= 3 ? 210 : 240) * k);
    return {
      node: (
        <Fan
          box={{ width: 520, height: slabHeight(model.slabs[0] ?? null, width) + 40, item: width }}
          items={model.slabs.map((slab) => <Slab key={slab.src} slab={slab} width={width} />)}
        />
      ),
      width: 540,
    };
  }
  if (layout === "fan-photos") {
    const photos = model.kind === "mail" ? model.photos : model.postPhotos;
    const width = Math.round((photos.length >= 3 ? 230 : 260) * k);
    return {
      node: (
        <Fan
          box={{ width: 520, height: width * 1.3 + 40, item: width }}
          items={photos.map((src) => <Photo key={src} src={src} width={width} height={Math.round(width * 1.3)} />)}
        />
      ),
      width: 540,
    };
  }
  return null;
}

function PostWithHero({ model, hero, canvas }: { model: ShareImage; hero: { node: ReactNode; width: number }; canvas: Canvas }) {
  const textWidth = canvas.width - hero.width - 64 - 40;
  return (
    <Stage canvas={canvas}>
      <Glow size={760} x={hero.width / 2 + 10} y={canvas.height / 2} strength={0.55} />
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <div style={{ display: "flex", width: hero.width, height: "100%", alignItems: "center", justifyContent: "center" }}>
          {hero.node}
        </div>
        <div style={{ ...col, flex: 1, justifyContent: "space-between", padding: "56px 64px 52px 40px" }}>
          <Author model={model} />
          <div style={col}>
            <Quote text={model.body} box={{ width: textWidth, height: 220, maxLines: 3, sizes: [58, 52, 46, 42, 38, 34] }} />
            {model.chip ? (
              <div style={{ display: "flex", marginTop: 26 }}>
                <Chip text={model.chip} maxWidth={textWidth} />
              </div>
            ) : null}
          </div>
          <Footer />
        </div>
      </div>
    </Stage>
  );
}

function PostText({ model, canvas }: { model: ShareImage; canvas: Canvas }) {
  return (
    <Stage canvas={canvas}>
      <Pattern canvas={canvas} />
      <Glow size={900} x={canvas.width - 80} y={canvas.height + 60} strength={0.6} />
      <Glow size={560} x={-40} y={-60} strength={0.35} />
      <Watermark size={340} x={canvas.width - 300} y={canvas.height - 330} />
      <div style={{ ...col, width: "100%", height: "100%", justifyContent: "space-between", padding: "52px 72px 48px" }}>
        <Author model={model} size={64} />
        <div style={{ ...row, alignItems: "flex-start" }}>
          <div style={{ display: "flex", width: 12, alignSelf: "stretch", borderRadius: 6, backgroundImage: `linear-gradient(180deg, ${C.accent}, ${C.deep})`, marginRight: 36 }} />
          <Quote text={model.body} box={{ width: canvas.width - 72 * 2 - 48 - 140, height: 300 }} />
        </div>
        <Footer />
      </div>
    </Stage>
  );
}

// Cards

function cardText(model: ShareImage, portrait: boolean) {
  const size = portrait ? 1.15 : 1;
  const generic = !model.slabs.length && !model.yearSet && !model.authorHandle;
  return (
    <div style={{ ...col, alignItems: portrait ? "center" : "flex-start" }}>
      {model.yearSet || model.chip ? (
        <div style={{ display: "flex", fontFamily: MONO, fontSize: 20 * size, letterSpacing: 2, color: C.accent }}>
          {[model.yearSet, model.chip].filter(Boolean).join(" · ").toUpperCase()}
        </div>
      ) : null}
      <div
        style={{
          display: "block",
          marginTop: 12,
          fontSize: (model.player.length > 22 ? 54 : 64) * size,
          lineHeight: 1.05,
          fontWeight: 700,
          letterSpacing: -1.5,
          lineClamp: 2,
          textAlign: portrait ? "center" : "left",
          maxWidth: portrait ? 900 : 600,
        }}
      >
        {generic ? "A card on Slabhold" : model.player}
      </div>
      {generic ? (
        <div style={{ display: "flex", marginTop: 16, fontSize: 28 * size, color: C.muted }}>
          Track your collection with recent sold prices.
        </div>
      ) : null}
      {model.grade ? (
        <div style={{ display: "flex", marginTop: 18 }}>
          <Chip text={model.grade.toUpperCase()} size={20 * size} maxWidth={400} />
        </div>
      ) : null}
      {model.showValue && model.valueLabel ? (
        <div style={{ ...col, marginTop: 28, alignItems: portrait ? "center" : "flex-start" }}>
          <div style={{ display: "flex", fontFamily: MONO, fontSize: 16 * size, letterSpacing: 2, color: C.muted }}>
            VALUE · RECENT SOLD PRICES
          </div>
          <div style={{ display: "flex", marginTop: 6, fontSize: 56 * size, fontWeight: 700, letterSpacing: -1.5 }}>
            {model.valueLabel}
          </div>
          {model.salesLabel ? (
            <div style={{ display: "flex", marginTop: 4, fontSize: 22 * size, color: C.muted }}>{model.salesLabel}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The owner's handle. An empty box keeps the layout when there is none. */
function Handle({ handle, size = 26 }: { handle: string; size?: number }) {
  return (
    <div style={{ display: "flex", height: size * 1.25, fontSize: size, fontWeight: 700, color: C.text }}>
      {handle ? `@${handle}` : ""}
    </div>
  );
}

function CardLandscape({ model, canvas }: { model: ShareImage; canvas: Canvas }) {
  const slab = model.slabs[0] ?? null;
  let width = Math.round(310 * heroScale(canvas));
  while (slabHeight(slab, width) > canvas.height - 70 && width > 200) width -= 10;
  return (
    <Stage canvas={canvas}>
      <Glow size={780} x={260} y={canvas.height / 2} strength={0.6} />
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <div style={{ display: "flex", width: 500, height: "100%", alignItems: "center", justifyContent: "center" }}>
          <Slab slab={slab} width={width} />
        </div>
        <div style={{ ...col, flex: 1, justifyContent: "space-between", padding: "60px 64px 52px 24px" }}>
          <Handle handle={model.authorHandle} />
          {cardText(model, false)}
          <Footer />
        </div>
      </div>
    </Stage>
  );
}

function CardPortrait({ model, canvas }: { model: ShareImage; canvas: Canvas }) {
  const slab = model.slabs[0] ?? null;
  let width = Math.round(460 * heroScale(canvas));
  while (slabHeight(slab, width) > 720 && width > 300) width -= 10;
  return (
    <Stage canvas={canvas}>
      <Pattern canvas={canvas} />
      <Glow size={1100} x={canvas.width / 2} y={520} strength={0.6} />
      <div style={{ ...col, width: "100%", height: "100%", alignItems: "center", justifyContent: "space-between", padding: "64px 72px 64px" }}>
        <Footer size={44} />
        <Slab slab={slab} width={width} />
        {cardText(model, true)}
        <Handle handle={model.authorHandle} size={30} />
      </div>
    </Stage>
  );
}

// Profiles

function ProfileLandscape({ model, canvas }: { model: ShareImage; canvas: Canvas }) {
  const slabs = model.slabs;
  const width = Math.round((slabs.length >= 3 ? 210 : slabs.length === 2 ? 230 : 280) * heroScale(canvas));
  const hero =
    slabs.length >= 2 ? (
      <Fan
        box={{ width: 500, height: slabHeight(slabs[0] ?? null, width) + 40, item: width }}
        items={slabs.map((slab) => <Slab key={slab.src} slab={slab} width={width} />)}
      />
    ) : (
      <Slab slab={slabs[0] ?? null} width={width} />
    );
  const name = model.title;
  return (
    <Stage canvas={canvas}>
      <Pattern canvas={canvas} />
      <Glow size={820} x={930} y={canvas.height / 2} strength={0.6} />
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <div style={{ ...col, flex: 1, justifyContent: "space-between", padding: "56px 24px 52px 72px" }}>
          <Footer />
          <div style={col}>
            <Avatar src={model.avatarUrl} name={name} size={112} />
            <div
              style={{
                display: "block",
                marginTop: 22,
                fontSize: name.length > 18 ? 48 : 58,
                fontWeight: 700,
                letterSpacing: -1.5,
                lineClamp: 1,
                maxWidth: 580,
              }}
            >
              {name}
            </div>
            <div style={{ ...row, marginTop: 8 }}>
              {model.authorHandle ? (
                <div style={{ display: "flex", fontSize: 26, color: C.accent }}>@{model.authorHandle}</div>
              ) : null}
              {model.detail ? (
                <div style={{ display: "flex", marginLeft: model.authorHandle ? 18 : 0, fontFamily: MONO, fontSize: 20, letterSpacing: 1.5, color: C.muted }}>
                  {model.detail.toUpperCase()}
                </div>
              ) : null}
            </div>
          </div>
          {model.badges.length ? (
            <div style={row}>
              {model.badges.map((badge) => (
                <div key={`${badge.category}:${badge.tier}`} style={{ display: "flex", marginRight: 14 }}>
                  <Badge badge={badge} size={92} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", fontFamily: MONO, fontSize: 18, letterSpacing: 2, color: C.muted }}>
              {model.kicker}
            </div>
          )}
        </div>
        <div style={{ display: "flex", width: 520, height: "100%", alignItems: "center", justifyContent: "center", paddingRight: 24 }}>
          {hero}
        </div>
      </div>
    </Stage>
  );
}

// Badges

function badgeGlow(tier: BadgeTier): number {
  return 0.35 + BADGE_TIERS.indexOf(tier) * 0.06;
}

function BadgeLandscape({ model, canvas }: { model: ShareImage; canvas: Canvas }) {
  const badge = model.badges[0];
  return (
    <Stage canvas={canvas}>
      <Pattern canvas={canvas} />
      {badge ? <Glow size={820} x={300} y={canvas.height / 2} strength={badgeGlow(badge.tier)} /> : null}
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <div style={{ display: "flex", width: 580, height: "100%", alignItems: "center", justifyContent: "center" }}>
          {badge ? <Badge badge={badge} size={420} /> : null}
        </div>
        <div style={{ ...col, flex: 1, justifyContent: "space-between", padding: "64px 64px 56px 8px" }}>
          <div style={{ display: "flex", fontFamily: MONO, fontSize: 24, letterSpacing: 4, color: C.accent }}>{model.kicker}</div>
          <div style={col}>
            <div style={{ display: "block", fontSize: 58, lineHeight: 1.05, fontWeight: 700, letterSpacing: -1.5, maxWidth: 540 }}>
              {model.authorHandle ? `@${model.authorHandle} unlocked it` : "Unlocked on Slabhold"}
            </div>
            <div style={{ display: "flex", marginTop: 18, fontSize: 28, color: C.text }}>{model.title}</div>
            {model.detail ? (
              <div style={{ display: "flex", marginTop: 6, fontSize: 22, color: C.muted }}>{model.detail}</div>
            ) : null}
          </div>
          <Footer size={40} />
        </div>
      </div>
    </Stage>
  );
}

function BadgePortrait({ model, canvas }: { model: ShareImage; canvas: Canvas }) {
  const badge = model.badges[0];
  return (
    <Stage canvas={canvas}>
      <Pattern canvas={canvas} />
      {badge ? <Glow size={1100} x={canvas.width / 2} y={560} strength={badgeGlow(badge.tier)} /> : null}
      <div style={{ ...col, width: "100%", height: "100%", alignItems: "center", justifyContent: "space-between", padding: "72px 72px 72px" }}>
        <div style={{ display: "flex", fontFamily: MONO, fontSize: 28, letterSpacing: 5, color: C.accent }}>{model.kicker}</div>
        {badge ? <Badge badge={badge} size={600} /> : null}
        <div style={{ ...col, alignItems: "center" }}>
          <div style={{ display: "block", fontSize: 68, lineHeight: 1.05, fontWeight: 700, letterSpacing: -2, textAlign: "center", maxWidth: 920 }}>
            {model.authorHandle ? `@${model.authorHandle} unlocked it` : "Unlocked on Slabhold"}
          </div>
          <div style={{ display: "flex", marginTop: 16, fontSize: 32, color: C.text }}>{model.title}</div>
          {model.detail ? <div style={{ display: "flex", marginTop: 6, fontSize: 26, color: C.muted }}>{model.detail}</div> : null}
        </div>
        <Footer size={48} />
      </div>
    </Stage>
  );
}

/** The share designs. Home, leaderboard, and Moving today keep their own frames. */
export function shareNode(model: ShareImage, canvas: Canvas): ReactNode | null {
  const portrait = canvas.height > canvas.width;
  if (model.kind === "badge") return portrait ? <BadgePortrait model={model} canvas={canvas} /> : <BadgeLandscape model={model} canvas={canvas} />;
  if (model.kind === "card") return portrait ? <CardPortrait model={model} canvas={canvas} /> : <CardLandscape model={model} canvas={canvas} />;
  if (model.kind === "profile") return <ProfileLandscape model={model} canvas={canvas} />;
  if (model.kind === "post" || model.kind === "mail") {
    const hero = postHero(model, canvas);
    return hero ? <PostWithHero model={model} hero={hero} canvas={canvas} /> : <PostText model={model} canvas={canvas} />;
  }
  return null;
}
