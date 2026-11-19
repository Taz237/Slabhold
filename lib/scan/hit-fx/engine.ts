import type { HitEffect, HitStrength } from "../hit";
import type { HitFrame } from "./timeline";

/**
 * The hit reveal's renderer: plain WebGL, no library. Loaded only when a hit plays (a dynamic
 * import), so /scan's first load never pays for it. One texture (the collector's own card photo),
 * three small programs, a few hundred triangles at most. Everything moves in the vertex shader, so
 * a frame is a handful of uniforms and three draw calls.
 *
 * Purple, white and black only. Nothing is drawn onto the card itself.
 */

export type FxRect = { x: number; y: number; w: number; h: number };

export type HitFxOptions = {
  canvas: HTMLCanvasElement;
  /** The cropped card photo, already loaded. The only image the effect uses. */
  photo: CanvasImageSource & { width: number; height: number };
  effect: HitEffect;
  strength: HitStrength;
  /** The canvas in CSS px, and the card's box inside it. */
  width: number;
  height: number;
  card: FxRect;
  /** Backing-store pixels per CSS px. */
  scale: number;
  /**
   * true: the canvas draws the whole scene itself (the stage and the card), opaque: the replay
   * and the share clip. false: it is a clear layer over the real card on the reveal's stage.
   */
  scene: boolean;
};

export type HitFx = {
  render(frame: HitFrame, seconds: number): void;
  dispose(): void;
};

const ATMOS_VERT = `
attribute vec2 aPos;
uniform vec2 uRes;
varying vec2 vPos;
void main() {
  vPos = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5) * uRes;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const ATMOS_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vPos;
uniform vec2 uRes;
uniform vec4 uCard;
uniform sampler2D uTex;
uniform float uLayer;
uniform float uTime;
uniform float uCardAlpha;
uniform float uCloud;
uniform float uFlash;
uniform float uGlow;
uniform float uShine;
uniform vec2 uRing;
uniform float uEdge;

// Over the live stage the layer has edges: everything fades out before it reaches them.
float edgeFade(float width) {
  float d = min(min(vPos.x, uRes.x - vPos.x), min(vPos.y, uRes.y - vPos.y));
  return mix(1.0, smoothstep(0.0, width, d), uEdge);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(11.3, 7.1); a *= 0.5; }
  return v;
}
float sdCard(vec2 p) {
  vec2 hw = uCard.zw * 0.5;
  float r = uCard.z * 0.035;
  vec2 q = abs(p - (uCard.xy + hw)) - hw + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float ring(float dist, float progress) {
  if (progress < 0.0 || progress > 1.0) return 0.0;
  float radius = uCard.z * (0.55 + progress * 1.9);
  float width = 5.0 + progress * 16.0;
  float x = (dist - radius) / width;
  return exp(-x * x) * (1.0 - progress) * (1.0 - progress);
}

void main() {
  vec3 purple = vec3(0.486, 0.227, 0.929);
  vec3 lilac = vec3(0.655, 0.545, 0.98);
  float d = sdCard(vPos);
  if (uLayer < 0.5) {
    // The stage: purple-black, lighter in the middle. Then the card and its shadow.
    vec2 q = (vPos / uRes - vec2(0.5, 0.46)) / vec2(0.64, 0.52);
    float r = length(q);
    vec3 bg = mix(vec3(0.2, 0.137, 0.369), vec3(0.102, 0.067, 0.192), smoothstep(0.0, 0.5, r));
    bg = mix(bg, vec3(0.035, 0.035, 0.043), smoothstep(0.5, 1.0, r));
    float shadow = exp(-max(sdCard(vPos - vec2(0.0, uCard.w * 0.045)), 0.0) / (uCard.z * 0.1)) * 0.6 * uCardAlpha;
    bg *= 1.0 - shadow;
    float inside = (1.0 - smoothstep(-0.75, 0.75, d)) * uCardAlpha;
    vec3 card = texture2D(uTex, clamp((vPos - uCard.xy) / uCard.zw, 0.0, 1.0)).rgb;
    gl_FragColor = vec4(mix(bg, card, inside), 1.0);
  } else if (uLayer < 1.5) {
    // Storm clouds: dark purple, thicker at the top, drifting across.
    vec2 q = vPos / uRes.x;
    float n = fbm(q * 2.6 + vec2(uTime * 0.42, uTime * 0.1));
    float n2 = fbm(q * 5.2 - vec2(uTime * 0.6, uTime * -0.08) + n * 1.4);
    float top = 1.0 - vPos.y / uRes.y;
    float dens = smoothstep(0.32, 0.86, n * 0.55 + n2 * 0.45 + top * 0.3);
    vec3 col = mix(vec3(0.03, 0.02, 0.07), vec3(0.2, 0.09, 0.42), n2) + purple * pow(n2, 3.0) * 0.55;
    float a = clamp(uCloud * (0.4 + dens * 0.58), 0.0, 0.94) * edgeFade(56.0);
    gl_FragColor = vec4(col * a, a);
  } else {
    // Light, added on top: the glow around the card, the shine on its face, the rings, the flash.
    vec3 add = vec3(0.0);
    add += mix(purple, vec3(1.0), 0.3) * exp(-max(d, 0.0) / (uCard.z * 0.2)) * step(0.0, d) * uGlow * 0.9;
    add += vec3(1.0) * (1.0 - smoothstep(-0.75, 0.75, d)) * uShine;
    float dist = length(vPos - (uCard.xy + uCard.zw * 0.5));
    add += mix(lilac, vec3(1.0), 0.35) * (ring(dist, uRing.x) + ring(dist, uRing.y));
    add += mix(lilac, vec3(1.0), 0.65) * uFlash * exp(-dist * dist / (uRes.x * uRes.x * 0.5));
    gl_FragColor = vec4(add * edgeFade(40.0), 0.0);
  }
}`;

const PIECE_VERT = `
attribute vec2 aHome;
attribute vec2 aCenter;
attribute vec4 aSeed;
attribute vec3 aBary;
uniform vec2 uRes;
uniform vec4 uCard;
uniform vec2 uOrigin;
uniform float uMode;
uniform float uT;
uniform float uPower;
uniform float uEdge;
varying vec2 vUv;
varying vec3 vBary;
varying float vAlpha;
varying float vP;
varying float vDist;
varying float vSeed;
varying float vGlint;

vec3 turn(vec3 v, vec3 axis, float a) {
  return v * cos(a) + cross(axis, v) * sin(a) + axis * dot(axis, v) * (1.0 - cos(a));
}

void main() {
  vec2 home = uCard.xy + aHome * uCard.zw;
  vec2 center = uCard.xy + aCenter * uCard.zw;
  vec2 pos = home;
  vAlpha = 1.0;
  vP = 1.0;
  vGlint = 0.0;
  vec2 aspect = vec2(1.0, uCard.w / uCard.z);
  vDist = length((aHome - uOrigin) * aspect);
  if (uMode < 0.5) {
    // A shard: out from the crack, toward the camera, tumbling in 3D, then gone.
    float t = uT;
    float e = 1.0 - pow(1.0 - t, 3.0);
    vec2 dir = (aCenter - uOrigin) * aspect;
    dir = dir / (length(dir) + 0.001);
    float speed = (0.5 + aSeed.x * 0.95) * uPower;
    vec2 fly = dir * speed * e * uCard.z * 1.5 + vec2(0.0, t * t * uCard.w * 0.3);
    vec3 axis = normalize(vec3(aSeed.y - 0.5, aSeed.z - 0.5, 0.3));
    float angle = e * (1.5 + aSeed.w * 5.0);
    vec3 local = turn(vec3(home - center, 0.0), axis, angle);
    float z = e * (aSeed.x - 0.25) * 320.0 + local.z;
    pos = center + fly + local.xy * (700.0 / (700.0 - min(z, 500.0)));
    vAlpha = 1.0 - smoothstep(0.3, 1.0, t);
    vGlint = step(0.001, t) * pow(abs(sin(angle * 1.7 + aSeed.z * 6.0)), 6.0);
  } else {
    // A square of the card: drifting in a cloud, then flying home and snapping in.
    float p = clamp((uT - aSeed.x * 0.6) / 0.4, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - p, 3.0);
    float ang = aSeed.y * 6.2831853 + uT * 1.2;
    float reach = max(uRes.x, uRes.y) * (0.18 + aSeed.z * 0.42);
    vec2 from = uCard.xy + uCard.zw * 0.5 + vec2(cos(ang), sin(ang) * 1.25) * reach;
    float size = mix(0.45 + aSeed.w * 1.3, 1.0, e);
    pos = mix(from, center, e) + (home - center) * size;
    vAlpha = smoothstep(0.0, 0.07, uT);
    vP = p;
  }
  float border = min(min(pos.x, uRes.x - pos.x), min(pos.y, uRes.y - pos.y));
  vAlpha *= mix(1.0, smoothstep(0.0, 36.0, border), uEdge);
  vUv = aHome;
  vBary = aBary;
  vSeed = aSeed.w;
  gl_Position = vec4(pos.x / uRes.x * 2.0 - 1.0, 1.0 - pos.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const PIECE_FRAG = (derivatives: boolean) => `
${derivatives ? "#extension GL_OES_standard_derivatives : enable" : ""}
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;
uniform float uMode;
uniform float uCrack;
uniform float uBurst;
uniform float uPieces;
varying vec2 vUv;
varying vec3 vBary;
varying float vAlpha;
varying float vP;
varying float vDist;
varying float vSeed;
varying float vGlint;

void main() {
  vec2 uv = clamp(vUv, 0.0, 1.0);
  if (uMode < 0.5) {
    // Frosted crystal over the card: the card blurred and hazed white. Cracks are the shards'
    // own edges, showing as far out as the crack has spread: a white core, a faint purple glow.
    ${
      derivatives
        ? "vec3 w = fwidth(vBary); vec3 c3 = smoothstep(vec3(0.0), w * 1.4, vBary); vec3 g3 = smoothstep(vec3(0.0), w * 7.0, vBary);"
        : "vec3 c3 = smoothstep(vec3(0.0), vec3(0.02), vBary); vec3 g3 = smoothstep(vec3(0.0), vec3(0.09), vBary);"
    }
    float core = 1.0 - min(min(c3.x, c3.y), c3.z);
    float halo = 1.0 - min(min(g3.x, g3.y), g3.z);
    float shown = uCrack <= 0.0 ? 0.0 : 1.0 - smoothstep(uCrack * 1.2 - 0.1, uCrack * 1.2, vDist);
    shown = max(shown, step(0.001, uBurst));
    vec3 card = texture2D(uTex, uv, 3.5).rgb;
    float pane = mix(0.66, 0.3, uBurst) * vAlpha;
    vec3 frost = mix(card, vec3(1.0), 0.4) * (0.82 + 0.3 * vSeed);
    vec3 rgb = frost * pane + vec3(1.0) * vGlint * 0.5 * vAlpha;
    float a = pane;
    rgb += vec3(0.655, 0.545, 0.98) * halo * shown * 0.5 * vAlpha;
    float line = core * shown * 0.92 * vAlpha;
    rgb = mix(rgb, vec3(1.0), line);
    a = max(a, line);
    gl_FragColor = vec4(rgb, a);
  } else {
    vec3 tex = texture2D(uTex, uv).rgb;
    vec3 tint = mix(vec3(0.486, 0.227, 0.929), vec3(1.0), vSeed * vSeed);
    float a = vAlpha * uPieces;
    gl_FragColor = vec4(mix(tint, tex, smoothstep(0.3, 1.0, vP)) * a, a);
  }
}`;

const BOLT_VERT = `
attribute vec2 aPos;
attribute vec2 aLine;
uniform vec2 uRes;
varying vec2 vLine;
void main() {
  vLine = aLine;
  gl_Position = vec4(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const BOLT_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vLine;
uniform float uHead;
uniform float uBright;
void main() {
  float x = abs(vLine.x);
  float core = 1.0 - smoothstep(0.04, 0.16, x);
  float halo = pow(1.0 - x, 3.0);
  float on = step(vLine.y, uHead) * uBright;
  gl_FragColor = vec4((vec3(1.0) * core + vec3(0.62, 0.45, 1.0) * halo * 0.7) * on, core * on);
}`;

/** The same "random" every time, so a replay and its clip match the reveal. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Most triangles any effect draws. A cap, so an iPhone 12 holds 60 fps. */
export const MAX_TRIANGLES = 1600;
const PIECE_STRIDE = 11;

/**
 * The crystal pane, cracked from `origin`: rings of shards between jittered spokes, in the card's
 * own 0-to-1 space (a little past its edge, so the pane overhangs the card).
 */
export function shardMesh(strength: HitStrength, aspect = 1.4): { data: Float32Array; triangles: number; origin: [number, number] } {
  const random = seeded(7 + strength);
  const spokes = 12 + strength * 2;
  const radii = [0, 0.1, 0.24, 0.44, 0.72, 1.3];
  const margin = 0.035;
  const origin: [number, number] = [0.5 + (random() - 0.5) * 0.12, 0.47 + (random() - 0.5) * 0.1];
  const clampTo = (value: number, max: number) => Math.min(max + margin, Math.max(-margin, value));
  const angles = Array.from({ length: spokes }, (_, index) => ((index + (random() - 0.5) * 0.7) / spokes) * Math.PI * 2);
  // points[ring][spoke], in card space (y scaled so the rings are round on a 5:7 card).
  const points = radii.map((radius, ring) =>
    angles.map((angle) => {
      const r = ring === 0 ? 0 : radius * (0.82 + random() * 0.36);
      return [clampTo(origin[0] + Math.cos(angle) * r, 1), clampTo(origin[1] + (Math.sin(angle) * r) / aspect, 1)] as [number, number];
    }),
  );
  const out: number[] = [];
  let triangles = 0;
  const add = (a: [number, number], b: [number, number], c: [number, number]) => {
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
    if (area < 0.0004 || triangles >= MAX_TRIANGLES) return;
    const center = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
    const seed = [random(), random(), random(), random()];
    [a, b, c].forEach((point, index) => out.push(point[0], point[1], center[0], center[1], ...seed, index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0));
    triangles += 1;
  };
  for (let ring = 0; ring < radii.length - 1; ring += 1) {
    for (let spoke = 0; spoke < spokes; spoke += 1) {
      const next = (spoke + 1) % spokes;
      const a = points[ring][spoke];
      const b = points[ring + 1][spoke];
      const c = points[ring + 1][next];
      const d = points[ring][next];
      add(a, b, c);
      if (ring > 0) add(a, c, d);
    }
  }
  return { data: new Float32Array(out), triangles, origin };
}

/** The card cut into squares: more of them the bigger the hit, never past the cap. */
export function pixelMesh(strength: HitStrength, aspect = 1.4): { data: Float32Array; triangles: number; cols: number; rows: number } {
  const random = seeded(31 + strength);
  const cols = 10 + strength * 4;
  const rows = Math.round(cols * aspect);
  const out: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x0 = col / cols;
      const x1 = (col + 1) / cols;
      const y0 = row / rows;
      const y1 = (row + 1) / rows;
      const center = [(x0 + x1) / 2, (y0 + y1) / 2];
      const seed = [random(), random(), random(), random()];
      for (const [x, y] of [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y0],
        [x1, y1],
        [x0, y1],
      ]) {
        out.push(x, y, center[0], center[1], ...seed, 1, 1, 1);
      }
    }
  }
  return { data: new Float32Array(out), triangles: cols * rows * 2, cols, rows };
}

/**
 * The bolt: a jagged line from above the stage down to the card, with two short forks. A strip of
 * triangles; each vertex carries how far across the bolt it is (-1 to 1) and how far along (0 to 1).
 */
export function boltMesh(width: number, card: FxRect, strength: HitStrength): { data: Float32Array; triangles: number } {
  const random = seeded(101 + strength);
  type Point = [number, number];
  const jag = (from: Point, to: Point, levels: number, sway: number): Point[] => {
    let path: Point[] = [from, to];
    for (let level = 0; level < levels; level += 1) {
      const next: Point[] = [path[0]];
      for (let index = 0; index < path.length - 1; index += 1) {
        const a = path[index];
        const b = path[index + 1];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const offset = (random() - 0.5) * sway * length;
        next.push([(a[0] + b[0]) / 2 + (-(b[1] - a[1]) / length) * offset, (a[1] + b[1]) / 2 + ((b[0] - a[0]) / length) * offset], b);
      }
      path = next;
    }
    return path;
  };
  const target: Point = [card.x + card.w * (0.46 + random() * 0.08), card.y + card.h * 0.36];
  const start: Point = [Math.min(width - 20, Math.max(20, target[0] + (random() - 0.5) * width * 0.5)), -12];
  const main = jag(start, target, 5, 0.34);
  const out: number[] = [];
  let triangles = 0;
  const strip = (path: Point[], half: number, from: number, to: number) => {
    const sides = path.map((point, index) => {
      const before = path[Math.max(0, index - 1)];
      const after = path[Math.min(path.length - 1, index + 1)];
      const length = Math.hypot(after[0] - before[0], after[1] - before[1]) || 1;
      const nx = (-(after[1] - before[1]) / length) * half;
      const ny = ((after[0] - before[0]) / length) * half;
      const along = from + ((to - from) * index) / (path.length - 1);
      return { left: [point[0] - nx, point[1] - ny, -1, along], right: [point[0] + nx, point[1] + ny, 1, along] };
    });
    for (let index = 0; index < sides.length - 1; index += 1) {
      const a = sides[index];
      const b = sides[index + 1];
      out.push(...a.left, ...a.right, ...b.left, ...a.right, ...b.right, ...b.left);
      triangles += 2;
    }
  };
  const half = 13 + strength * 4;
  strip(main, half, 0, 1);
  for (const at of [0.3, 0.55].slice(0, strength >= 2 ? 2 : 1)) {
    const index = Math.round((main.length - 1) * at);
    const from = main[index];
    const side = random() > 0.5 ? 1 : -1;
    const end: Point = [from[0] + side * width * (0.14 + random() * 0.12), from[1] + card.h * (0.16 + random() * 0.14)];
    strip(jag(from, end, 3, 0.4), half * 0.55, at, Math.min(1, at + 0.4));
  }
  return { data: new Float32Array(out), triangles };
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("hit-fx: no shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    gl.deleteShader(shader);
    throw new Error(`hit-fx: shader ${log}`);
  }
  return shader;
}

function link(gl: WebGLRenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("hit-fx: no program");
  const shaders = [compile(gl, gl.VERTEX_SHADER, vertex), compile(gl, gl.FRAGMENT_SHADER, fragment)];
  shaders.forEach((shader) => gl.attachShader(program, shader));
  gl.linkProgram(program);
  // The program keeps its own copy: the shaders can go now.
  shaders.forEach((shader) => {
    gl.detachShader(program, shader);
    gl.deleteShader(shader);
  });
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "";
    gl.deleteProgram(program);
    throw new Error(`hit-fx: link ${log}`);
  }
  return program;
}

/** The card photo as a texture: cropped to the card's 5:7 like the page shows it, mipmapped for the frost. */
function cardTexture(gl: WebGLRenderingContext, photo: HitFxOptions["photo"], aspect: number): WebGLTexture {
  const sheet = document.createElement("canvas");
  sheet.width = 512;
  sheet.height = 1024;
  const context = sheet.getContext("2d");
  if (!context) throw new Error("hit-fx: no 2d canvas");
  // Cover the sheet like object-cover does, by where the whole photo is drawn (never a source
  // crop: an SVG photo has no pixel size of its own to crop from).
  const sourceAspect = photo.height / photo.width || aspect;
  const drawW = sourceAspect > aspect ? sheet.width : (sheet.height / sourceAspect) * (aspect / (sheet.height / sheet.width));
  const drawH = sourceAspect > aspect ? (sheet.width * sourceAspect) / (aspect / (sheet.height / sheet.width)) : sheet.height;
  context.drawImage(photo, (sheet.width - drawW) / 2, (sheet.height - drawH) / 2, drawW, drawH);
  const texture = gl.createTexture();
  if (!texture) throw new Error("hit-fx: no texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Throws on a photo the page may not read (another site's image): the reveal falls back.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sheet);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  sheet.width = 0;
  sheet.height = 0;
  return texture;
}

/** Sets the effect up. Throws when WebGL is missing or the photo can't be read: the caller falls back. */
export function createHitFx(options: HitFxOptions): HitFx {
  const { canvas, effect, strength, card, scene } = options;
  canvas.width = Math.round(options.width * options.scale);
  canvas.height = Math.round(options.height * options.scale);
  const gl = canvas.getContext("webgl", { alpha: !scene, premultipliedAlpha: true, antialias: true, depth: false, stencil: false, powerPreference: "high-performance" });
  if (!gl) throw new Error("hit-fx: no webgl");
  const buffers: WebGLBuffer[] = [];
  const programs: WebGLProgram[] = [];
  let texture: WebGLTexture | null = null;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    buffers.forEach((buffer) => gl.deleteBuffer(buffer));
    programs.forEach((program) => gl.deleteProgram(program));
    if (texture) gl.deleteTexture(texture);
    // Hand the GPU memory back now, not whenever the canvas is collected.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.width = 0;
    canvas.height = 0;
  };

  try {
    const aspect = card.h / card.w;
    texture = cardTexture(gl, options.photo, aspect);
    const buffer = (data: Float32Array) => {
      const made = gl.createBuffer();
      if (!made) throw new Error("hit-fx: no buffer");
      buffers.push(made);
      gl.bindBuffer(gl.ARRAY_BUFFER, made);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return made;
    };
    const program = (vertex: string, fragment: string) => {
      const made = link(gl, vertex, fragment);
      programs.push(made);
      return made;
    };
    const uniforms = (target: WebGLProgram, names: string[]) => Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(target, name)]));

    const atmos = program(ATMOS_VERT, ATMOS_FRAG);
    const atmosU = uniforms(atmos, ["uRes", "uCard", "uTex", "uLayer", "uTime", "uCardAlpha", "uCloud", "uFlash", "uGlow", "uShine", "uRing", "uEdge"]);
    const quad = buffer(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
    const atmosPos = gl.getAttribLocation(atmos, "aPos");

    const mesh = effect === "shatter" ? shardMesh(strength, aspect) : effect === "pixel" ? pixelMesh(strength, aspect) : null;
    const origin = effect === "shatter" && mesh && "origin" in mesh ? mesh.origin : [0.5, 0.5];
    const derivatives = effect === "shatter" && Boolean(gl.getExtension("OES_standard_derivatives"));
    const pieces = mesh ? program(PIECE_VERT, PIECE_FRAG(derivatives)) : null;
    const piecesU = pieces ? uniforms(pieces, ["uRes", "uCard", "uOrigin", "uMode", "uT", "uPower", "uTex", "uCrack", "uBurst", "uPieces", "uEdge"]) : null;
    const piecesBuffer = mesh ? buffer(mesh.data) : null;
    const piecesAttr = pieces ? (["aHome", "aCenter", "aSeed", "aBary"] as const).map((name) => gl.getAttribLocation(pieces, name)) : [];

    const boltGeometry = effect === "storm" ? boltMesh(options.width, card, strength) : null;
    const bolt = boltGeometry ? program(BOLT_VERT, BOLT_FRAG) : null;
    const boltU = bolt ? uniforms(bolt, ["uRes", "uHead", "uBright"]) : null;
    const boltBuffer = boltGeometry ? buffer(boltGeometry.data) : null;
    const boltAttr = bolt ? [gl.getAttribLocation(bolt, "aPos"), gl.getAttribLocation(bolt, "aLine")] : [];

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const float = Float32Array.BYTES_PER_ELEMENT;
    const layer = (which: number, frame: HitFrame, seconds: number) => {
      gl.useProgram(atmos);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(atmosPos);
      gl.vertexAttribPointer(atmosPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(atmosU.uRes, options.width, options.height);
      gl.uniform4f(atmosU.uCard, card.x, card.y, card.w, card.h);
      gl.uniform1i(atmosU.uTex, 0);
      gl.uniform1f(atmosU.uLayer, which);
      gl.uniform1f(atmosU.uTime, seconds);
      gl.uniform1f(atmosU.uCardAlpha, frame.card);
      gl.uniform1f(atmosU.uCloud, frame.cloud);
      gl.uniform1f(atmosU.uFlash, frame.flash);
      gl.uniform1f(atmosU.uGlow, frame.glow);
      gl.uniform1f(atmosU.uShine, frame.shine);
      gl.uniform2f(atmosU.uRing, frame.ring1, frame.ring2);
      gl.uniform1f(atmosU.uEdge, scene ? 0 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(atmosPos);
    };

    const render = (frame: HitFrame, seconds: number) => {
      if (disposed || gl.isContextLost()) return;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (scene) layer(0, frame, seconds);
      if (frame.cloud > 0.001) layer(1, frame, seconds);

      const piecesOn = effect === "shatter" ? frame.burst < 1 : frame.pieces > 0.001;
      if (pieces && piecesU && piecesBuffer && mesh && piecesOn) {
        gl.useProgram(pieces);
        gl.bindBuffer(gl.ARRAY_BUFFER, piecesBuffer);
        const sizes = [2, 2, 4, 3];
        let offset = 0;
        piecesAttr.forEach((location, index) => {
          if (location >= 0) {
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, sizes[index], gl.FLOAT, false, PIECE_STRIDE * float, offset * float);
          }
          offset += sizes[index];
        });
        gl.uniform2f(piecesU.uRes, options.width, options.height);
        gl.uniform4f(piecesU.uCard, card.x, card.y, card.w, card.h);
        gl.uniform2f(piecesU.uOrigin, origin[0], origin[1]);
        gl.uniform1f(piecesU.uMode, effect === "shatter" ? 0 : 1);
        gl.uniform1f(piecesU.uT, effect === "shatter" ? frame.burst : frame.assemble);
        gl.uniform1f(piecesU.uPower, 0.8 + strength * 0.2);
        gl.uniform1i(piecesU.uTex, 0);
        gl.uniform1f(piecesU.uCrack, frame.crack);
        gl.uniform1f(piecesU.uBurst, frame.burst);
        gl.uniform1f(piecesU.uPieces, frame.pieces);
        gl.uniform1f(piecesU.uEdge, scene ? 0 : 1);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.triangles * 3);
        piecesAttr.forEach((location) => location >= 0 && gl.disableVertexAttribArray(location));
      }

      if (bolt && boltU && boltBuffer && boltGeometry && frame.bolt > 0.001) {
        gl.useProgram(bolt);
        gl.bindBuffer(gl.ARRAY_BUFFER, boltBuffer);
        gl.enableVertexAttribArray(boltAttr[0]);
        gl.vertexAttribPointer(boltAttr[0], 2, gl.FLOAT, false, 4 * float, 0);
        gl.enableVertexAttribArray(boltAttr[1]);
        gl.vertexAttribPointer(boltAttr[1], 2, gl.FLOAT, false, 4 * float, 2 * float);
        gl.uniform2f(boltU.uRes, options.width, options.height);
        gl.uniform1f(boltU.uHead, frame.boltHead);
        gl.uniform1f(boltU.uBright, frame.bolt);
        gl.drawArrays(gl.TRIANGLES, 0, boltGeometry.triangles * 3);
        boltAttr.forEach((location) => gl.disableVertexAttribArray(location));
      }

      if (frame.flash > 0.001 || frame.glow > 0.001 || frame.shine > 0.001 || frame.ring1 >= 0 || frame.ring2 >= 0) layer(2, frame, seconds);
    };

    return { render, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
