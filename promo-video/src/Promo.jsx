import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, } from "remotion";
import { loadFont } from "@remotion/fonts";
// Geist (OFL), bundled locally so renders never depend on the network.
const SANS = "Geist";
const MONO = "Geist Mono";
loadFont({ family: SANS, url: staticFile("fonts/Geist-Variable.woff2"), weight: "100 900" });
loadFont({ family: MONO, url: staticFile("fonts/GeistMono-Variable.woff2"), weight: "100 900" });
export const FPS = 30;
export const DURATION = 21 * FPS; // 630 frames
// Brand
const BG = "#0b0b10";
const PURPLE = "#7c3aed";
const LILAC = "#a78bfa";
const WHITE = "#ffffff";
// Instagram safe zone: no text above 250px or below 1570px.
const SAFE_TOP = 250;
// Scene timing (frames)
const T = {
    hookEnd: 60,
    phoneIn: 60,
    card: 210,
    podium: 360,
    end: 510,
};
// Phone geometry. Screenshots are 390 css px wide at 2x (780 px).
const SCREEN_W = 500;
const SCREEN_H = Math.round((SCREEN_W * 844) / 390); // 1082
const BEZEL = 14;
const PHONE_W = SCREEN_W + BEZEL * 2;
const PHONE_H = SCREEN_H + BEZEL * 2;
const PHONE_TOP = 440; // bottom edge lands at 1550
const K = SCREEN_W / 780; // screenshot px -> screen px
const S = SCREEN_W / 390; // css px -> screen px
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const ramp = (f, a, b, from = 0, to = 1, easing = easeOut) => interpolate(f, [a, b], [from, to], { ...clamp, easing });
/** A slice of a screenshot (y range in screenshot px), drawn at screen width. */
function Crop({ src, y0, y1, style }) {
    return (<div style={{ position: "absolute", left: 0, width: SCREEN_W, height: (y1 - y0) * K, overflow: "hidden", ...style }}>
      <Img src={staticFile(src)} style={{ position: "absolute", left: 0, top: -y0 * K, width: SCREEN_W }}/>
    </div>);
}
function Background() {
    return (<AbsoluteFill style={{ backgroundColor: BG }}>
      <AbsoluteFill style={{
            background: `radial-gradient(60% 40% at 50% 55%, rgba(124,58,237,0.28) 0%, rgba(124,58,237,0.08) 45%, rgba(11,11,16,0) 75%)`,
        }}/>
    </AbsoluteFill>);
}
/* ---------------------------------- 1. Hook --------------------------------- */
function Hook() {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const line = (delay) => {
        const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 220, mass: 0.6 } });
        return { scale: interpolate(s, [0, 1], [1.35, 1]), opacity: ramp(frame, delay, delay + 8) };
    };
    const a = line(2);
    const b = line(12);
    const exit = ramp(frame, 50, 64, 1, 0, Easing.in(Easing.cubic));
    const exitScale = interpolate(exit, [0, 1], [0.94, 1]);
    const text = {
        fontFamily: SANS,
        fontWeight: 800,
        fontSize: 150,
        letterSpacing: "-0.045em",
        lineHeight: 1,
        textAlign: "center",
    };
    return (<AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: exit, transform: `scale(${exitScale})` }}>
      <div style={{ ...text, color: WHITE, opacity: a.opacity, transform: `scale(${a.scale})` }}>Your cards.</div>
      <div style={{ ...text, color: LILAC, marginTop: 18, opacity: b.opacity, transform: `scale(${b.scale})` }}>
        Your crew.
      </div>
    </AbsoluteFill>);
}
/* --------------------------------- Captions --------------------------------- */
function Caption({ tag, title, start, end }) {
    const frame = useCurrentFrame();
    const inP = ramp(frame, start, start + 14);
    const outP = ramp(frame, end - 10, end, 0, 1, Easing.in(Easing.cubic));
    const opacity = inP * (1 - outP);
    const y = (1 - inP) * 24 - outP * 12;
    if (opacity <= 0)
        return null;
    return (<div style={{
            position: "absolute",
            top: SAFE_TOP + 28,
            left: 60,
            right: 60,
            textAlign: "center",
            opacity,
            transform: `translateY(${y}px)`,
        }}>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, letterSpacing: "0.22em", color: LILAC }}>{tag}</div>
      <div style={{
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 64,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            color: WHITE,
            marginTop: 10,
        }}>
        {title}
      </div>
    </div>);
}
/* ---------------------------------- Screens --------------------------------- */
const NAV_Y0 = 1536; // bottom nav in a 1688px-tall screenshot
function FeedScreen() {
    const frame = useCurrentFrame();
    // Slow, steady scroll through the feed: two posts with cards.
    const scroll = interpolate(frame, [T.phoneIn + 34, T.card - 8], [0, 1880 * K], { ...clamp, easing: easeInOut });
    return (<AbsoluteFill style={{ backgroundColor: "#f3f3f4" }}>
      <Img src={staticFile("screens/home-feed-full.png")} style={{ position: "absolute", left: 0, top: -scroll, width: SCREEN_W }}/>
      <Crop src="screens/home.png" y0={0} y1={404} style={{ top: 0 }}/>
      <Crop src="screens/home.png" y0={NAV_Y0} y1={1688} style={{ bottom: 0 }}/>
    </AbsoluteFill>);
}
// Demo value series for the chart (fixture data, ends +12%).
const SERIES = [1107, 1098, 1121, 1115, 1139, 1132, 1158, 1150, 1176, 1194, 1186, 1213, 1229, 1240];
function ValuePanel({ local }) {
    const { fps } = useVideoConfig();
    const W = SCREEN_W - 32 * S;
    const chartW = W - 32 * S;
    const chartH = 220;
    const min = Math.min(...SERIES) - 20;
    const max = Math.max(...SERIES) + 15;
    const pts = SERIES.map((v, i) => [
        (i / (SERIES.length - 1)) * chartW,
        chartH - ((v - min) / (max - min)) * chartH,
    ]);
    const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${d} L${chartW},${chartH} L0,${chartH} Z`;
    const DRAW_START = 22;
    const DRAW_END = 82;
    const draw = ramp(local, DRAW_START, DRAW_END, 0, 1, Easing.bezier(0.33, 0, 0.2, 1));
    const value = Math.round(interpolate(draw, [0, 1], [SERIES[0], SERIES[SERIES.length - 1]]));
    const areaOpacity = ramp(local, DRAW_END - 10, DRAW_END + 10) * 0.9;
    const endDot = ramp(local, DRAW_END - 2, DRAW_END + 6);
    const chipS = spring({ frame: local - (DRAW_END + 4), fps, config: { damping: 11, stiffness: 180, mass: 0.7 } });
    const [ex, ey] = pts[pts.length - 1];
    return (<div style={{
            position: "absolute",
            left: 16 * S,
            width: W,
            top: 68 + 492 + 10,
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 18 * S,
            padding: `${14 * S}px ${16 * S}px`,
            boxShadow: "0 8px 24px rgba(24,24,27,0.06)",
        }}>
      <div style={{ fontFamily: MONO, fontSize: 11 * S, letterSpacing: "0.14em", color: "#71717a" }}>VALUE · 90 DAYS</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 * S, marginTop: 4 * S }}>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30 * S, letterSpacing: "-0.03em", color: "#18181b" }}>
          ${value.toLocaleString("en-US")}
        </div>
        <div style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 19 * S,
            color: "#15803d",
            background: "#dcfce7",
            borderRadius: 999,
            padding: `${5 * S}px ${11 * S}px`,
            opacity: Math.min(1, chipS * 1.5),
            transform: `scale(${interpolate(chipS, [0, 1], [0.4, 1])})`,
            transformOrigin: "left center",
        }}>
          ▲ +12%
        </div>
      </div>
      <svg width={chartW} height={chartH + 8} style={{ marginTop: 10 * S, overflow: "visible" }}>
        <defs>
          <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={PURPLE} stopOpacity={0.22}/>
            <stop offset="100%" stopColor={PURPLE} stopOpacity={0}/>
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (<line key={g} x1={0} x2={chartW} y1={chartH * g} y2={chartH * g} stroke="#f0f0f2" strokeWidth={1.5}/>))}
        <path d={area} fill="url(#fill)" opacity={areaOpacity}/>
        <path d={d} fill="none" stroke={PURPLE} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw}/>
        <circle cx={ex} cy={ey} r={14 * endDot} fill={PURPLE} opacity={0.18 * endDot}/>
        <circle cx={ex} cy={ey} r={6.5 * endDot} fill={PURPLE} stroke="#fff" strokeWidth={2.5}/>
      </svg>
      <div style={{ fontFamily: SANS, fontSize: 12 * S, color: "#71717a", marginTop: 6 * S }}>Recent sold prices via Trawl</div>
    </div>);
}
function CardScreen() {
    const local = useCurrentFrame() - T.card;
    return (<AbsoluteFill style={{ backgroundColor: "#f3f3f4" }}>
      <Crop src="screens/card.png" y0={0} y1={104} style={{ top: 0 }}/>
      <Crop src="screens/card.png" y0={448} y1={1216} style={{ top: 68 }}/>
      <ValuePanel local={local}/>
      <Crop src="screens/card.png" y0={NAV_Y0} y1={1688} style={{ bottom: 0 }}/>
    </AbsoluteFill>);
}
const PODIUM = [
    { rank: 2, handle: "waxroom", initials: "MC", accent: "linear-gradient(135deg,#8b5cf6,#4c1d95)", score: 36, avatar: 44, plinth: 110 },
    { rank: 1, handle: "flipcity", initials: "JH", accent: "linear-gradient(135deg,#e11d48,#7f1d1d)", score: 48, avatar: 56, plinth: 150 },
    { rank: 3, handle: "boxbreak", initials: "SO", accent: "linear-gradient(135deg,#f59e0b,#78350f)", score: 29, avatar: 44, plinth: 84 },
];
const BANNER = {
    1: "linear-gradient(135deg, #FFE27A 0%, #F5B700 38%, #FFF3B0 68%, #D99A00 100%)",
    2: "linear-gradient(135deg, #F7F9FB 0%, #C3CBD4 52%, #EEF1F5 100%)",
    3: "linear-gradient(135deg, #F6BC8A 0%, #C46A2B 52%, #F3CBA6 100%)",
};
const RING = {
    1: "linear-gradient(135deg, #FFF3B0, #D99A00)",
    2: "linear-gradient(135deg, #FFFFFF, #8D97A3)",
    3: "linear-gradient(135deg, #F6BC8A, #8A4314)",
};
const PLACE = { 1: "1ST", 2: "2ND", 3: "3RD" };
function Crown({ size }) {
    return (<svg width={size} height={size} viewBox="0 0 24 24" fill="rgba(9,9,11,0.15)" stroke="#09090b" strokeWidth={2.4} strokeLinejoin="round">
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/>
      <path d="M5 21h14" strokeLinecap="round"/>
    </svg>);
}
function PodiumScreen() {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const local = frame - T.podium;
    const colW = (390 - 24 - 12) / 3;
    const baseY = SCREEN_H - 99; // podium sits on the nav
    const P = S * 1.3; // podium drawn a bit larger than 1:1 so it reads on a phone feed
    return (<AbsoluteFill style={{ backgroundColor: "#09090b" }}>
      <Crop src="screens/leaderboard.png" y0={0} y1={104} style={{ top: 0 }}/>
      <Crop src="screens/leaderboard.png" y0={104} y1={630} style={{ top: 68 }}/>
      {PODIUM.map((p, i) => {
            const isFirst = p.rank === 1;
            // #2 and #3 settle in first, then #1 rises above them.
            const start = isFirst ? 34 : 16 + (p.rank - 2) * 6;
            const s = spring({
                frame: local - start,
                fps,
                config: isFirst ? { damping: 16, stiffness: 120, mass: 0.9 } : { damping: 200, stiffness: 160 },
            });
            const rise = isFirst ? interpolate(s, [0, 1], [150, 0]) : interpolate(s, [0, 1], [40, 0]);
            const plinthH = p.plinth * P * (isFirst ? interpolate(s, [0, 1], [0.35, 1]) : 1);
            const glow = isFirst ? ramp(local, 52, 78) : 0;
            const shine = isFirst ? ramp(local, 62, 92, -1, 2, easeInOut) : -2;
            const left = 12 * S + i * (colW + 6) * S;
            return (<div key={p.rank} style={{
                    position: "absolute",
                    left,
                    width: colW * S,
                    bottom: SCREEN_H - baseY,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    opacity: Math.min(1, s * 1.6),
                    transform: `translateY(${rise}px)`,
                }}>
            {isFirst ? (<div style={{
                        position: "absolute",
                        top: -40,
                        left: "50%",
                        width: 300,
                        height: 300,
                        marginLeft: -150,
                        borderRadius: "50%",
                        background: "radial-gradient(circle, rgba(245,183,0,0.45) 0%, rgba(245,183,0,0.12) 40%, rgba(245,183,0,0) 70%)",
                        opacity: glow,
                    }}/>) : null}
            <div style={{ padding: 2.5, borderRadius: 999, background: RING[p.rank], position: "relative" }}>
              <div style={{ padding: 2.5, borderRadius: 999, background: "#09090b" }}>
                <div style={{
                    width: p.avatar * P,
                    height: p.avatar * P,
                    borderRadius: 999,
                    background: p.accent,
                    display: "grid",
                    placeItems: "center",
                    fontFamily: SANS,
                    fontWeight: 700,
                    fontSize: (isFirst ? 18 : 15) * P,
                    color: WHITE,
                }}>
                  {p.initials}
                </div>
              </div>
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14 * P, color: WHITE, marginTop: 6 * P, letterSpacing: "-0.02em", position: "relative" }}>
              @{p.handle}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 * P, marginTop: 3 * P, position: "relative" }}>
              <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 18 * P, color: WHITE }}>{p.score}</span>
              <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 11 * P, color: "#a1a1aa" }}>pts</span>
            </div>
            <div style={{
                    position: "relative",
                    marginTop: 8 * P,
                    width: "100%",
                    height: plinthH,
                    borderRadius: `${12 * P}px ${12 * P}px 0 0`,
                    background: BANNER[p.rank],
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4 * P,
                    paddingTop: 8 * P,
                    overflow: "hidden",
                    boxShadow: isFirst ? `0 0 ${40 * glow}px rgba(245,183,0,${0.55 * glow})` : undefined,
                }}>
              {isFirst ? <Crown size={20 * P}/> : null}
              <span style={{
                    fontFamily: MONO,
                    fontWeight: 700,
                    fontSize: 9 * P,
                    letterSpacing: "0.16em",
                    color: WHITE,
                    background: "rgba(9,9,11,0.85)",
                    borderRadius: 3,
                    padding: `${3 * P}px ${6 * P}px`,
                }}>
                {PLACE[p.rank]}
              </span>
              {isFirst ? (<div style={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,.65) 50%, transparent 65%)",
                        transform: `translateX(${shine * 100}%)`,
                    }}/>) : null}
            </div>
          </div>);
        })}
      <Crop src="screens/leaderboard.png" y0={NAV_Y0} y1={1688} style={{ bottom: 0 }}/>
    </AbsoluteFill>);
}
/** Screens push in from the right, like tapping into the next page. */
function ScreenStack() {
    const frame = useCurrentFrame();
    const push = (at) => ramp(frame, at, at + 16, 0, 1, Easing.bezier(0.22, 1, 0.36, 1));
    const toCard = push(T.card);
    const toPodium = push(T.podium);
    const layer = (x, dim, children, show) => show ? (<AbsoluteFill style={{ transform: `translateX(${x}px)` }}>
        {children}
        {dim > 0 ? <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${dim})` }}/> : null}
      </AbsoluteFill>) : null;
    return (<AbsoluteFill style={{ overflow: "hidden", borderRadius: 42 }}>
      {layer(-toCard * SCREEN_W * 0.3, toCard * 0.35, <FeedScreen />, toCard < 1)}
      {layer((1 - toCard) * SCREEN_W - toPodium * SCREEN_W * 0.3, toPodium * 0.35, <CardScreen />, toCard > 0 && toPodium < 1)}
      {layer((1 - toPodium) * SCREEN_W, 0, <PodiumScreen />, toPodium > 0)}
    </AbsoluteFill>);
}
function Phone() {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const enter = spring({ frame: frame - T.phoneIn, fps, config: { damping: 200, stiffness: 90 } });
    const exit = ramp(frame, T.end, T.end + 18, 0, 1, Easing.in(Easing.cubic));
    if (frame < T.phoneIn || exit >= 1)
        return null;
    const y = interpolate(enter, [0, 1], [1500, 0]) + exit * 260;
    return (<div style={{
            position: "absolute",
            left: (1080 - PHONE_W) / 2,
            top: PHONE_TOP,
            width: PHONE_W,
            height: PHONE_H,
            borderRadius: 56,
            background: "linear-gradient(160deg, #2a2a33, #121217)",
            boxShadow: "0 0 0 2px #34343d, 0 40px 120px rgba(124,58,237,0.35), 0 20px 60px rgba(0,0,0,0.6)",
            padding: BEZEL,
            transform: `translateY(${y}px) scale(${1 - exit * 0.06})`,
            opacity: 1 - exit,
        }}>
      <div style={{ position: "relative", width: SCREEN_W, height: SCREEN_H, borderRadius: 42, overflow: "hidden" }}>
        <ScreenStack />
      </div>
    </div>);
}
/* --------------------------------- End card --------------------------------- */
function EndCard() {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const local = frame - T.end;
    if (local < 0)
        return null;
    const logo = spring({ frame: local - 20, fps, config: { damping: 15, stiffness: 160 } });
    const word = ramp(local, 26, 42);
    const url = ramp(local, 36, 52);
    const tag = ramp(local, 46, 62);
    return (<AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <Img src={staticFile("logo.svg")} style={{ width: 168, height: 168, opacity: logo, transform: `scale(${interpolate(logo, [0, 1], [0.7, 1])})` }}/>
      <div style={{
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 156,
            letterSpacing: "-0.05em",
            color: WHITE,
            marginTop: 44,
            lineHeight: 1,
            opacity: word,
            transform: `translateY(${(1 - word) * 30}px)`,
        }}>
        Slabhold
      </div>
      <div style={{
            fontFamily: SANS,
            fontWeight: 600,
            fontSize: 56,
            letterSpacing: "-0.02em",
            color: LILAC,
            marginTop: 26,
            opacity: url,
            transform: `translateY(${(1 - url) * 20}px)`,
        }}>
        slabhold.app
      </div>
      <div style={{
            fontFamily: MONO,
            fontWeight: 500,
            fontSize: 28,
            letterSpacing: "0.2em",
            color: "#a1a1aa",
            marginTop: 56,
            opacity: tag,
        }}>
        YOUR CARDS. YOUR CREW.
      </div>
    </AbsoluteFill>);
}
export function Promo() {
    return (<AbsoluteFill style={{ backgroundColor: BG, fontFamily: SANS }}>
      <Background />
      <Hook />
      <Caption tag="THE FEED" title="Post pickups. Talk cards." start={T.phoneIn + 10} end={T.card + 4}/>
      <Caption tag="COMPS" title="Track every card's value." start={T.card + 6} end={T.podium + 4}/>
      <Caption tag="LEADERBOARD" title="Climb the weekly board." start={T.podium + 6} end={T.end + 6}/>
      <Phone />
      <EndCard />
    </AbsoluteFill>);
}
