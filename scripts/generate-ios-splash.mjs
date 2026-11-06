/**
 * One-shot generator for the iOS launch screen image (Splash.imageset).
 * Run: node scripts/generate-ios-splash.mjs
 * Uses a temporary sharp install; sharp is not a dependency of the app.
 *
 * A still galaxy that matches the web galaxy (landing + /welcome):
 *   linear-gradient(180deg, #09090B 0%, #09090B 30%, #1E1036 100%)
 * with a few faint, seeded star dots and the logo from public/logo.svg
 * centered on top. No glow, no recolor.
 *
 * The launch screen shows this square with scaleAspectFill, so on a portrait
 * iPhone the image height equals the screen height (the gradient stops land
 * exactly where the web ones do) and only the middle ~46% of the width shows.
 * Stars and the logo are sized and placed for that visible band.
 *
 * Also writes a phone-sized preview to docs/ios-splash-galaxy-1/.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const imagesetDir = join(root, "ios-app/ios/App/App/Assets.xcassets/Splash.imageset");
const outNames = ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"];
const previewDir = join(root, "docs/ios-splash-galaxy-1");
const logoPath = join(root, "public", "logo.svg");

const SIZE = 2732;
const SKY_TOP = "#09090B";
const SKY_BOTTOM = "#1E1036";
const STAR_COLORS = ["#F4F4F5", "#A78BFA"];
const STAR_COUNT = 26;

// On a 390×844pt iPhone, aspect-fill shows ~1262 of the 2732 px across.
// 340 px is ~27% of that visible width (~105pt on screen).
const LOGO = 340;

/** Same stable pseudo-random numbers as the web Dust (components/onboarding/intro/effects.tsx). */
function seeded(index, salt) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

const round = (n) => Math.round(n * 10) / 10;

function stars() {
  const center = SIZE / 2;
  const keepOut = LOGO * 0.95; // leave clear sky around the logo
  const dots = [];
  for (let index = 0; dots.length < STAR_COUNT && index < STAR_COUNT * 10; index += 1) {
    // Most stars inside the band a phone shows; a few wider for taller crops.
    const wide = seeded(index, 7) < 0.2;
    const span = wide ? 0.8 : 0.42;
    const x = SIZE * (0.5 - span / 2 + seeded(index, 5) * span);
    const y = SIZE * (0.04 + seeded(index, 8) * 0.92);
    if (Math.abs(x - center) < keepOut && Math.abs(y - center) < keepOut) continue;
    const r = 3 + seeded(index, 4) * 4; // ~2–4pt dots on screen, like the web dust
    const opacity = 0.16 + seeded(index, 9) * 0.3;
    const fill = STAR_COLORS[seeded(index, 10) < 0.6 ? 0 : 1];
    dots.push(`<circle cx="${round(x)}" cy="${round(y)}" r="${round(r)}" fill="${fill}" fill-opacity="${round(opacity * 100) / 100}"/>`);
  }
  return dots.join("\n    ");
}

const logoInner = readFileSync(logoPath, "utf8")
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .trim();

const offset = (SIZE - LOGO) / 2;
const splashSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${SKY_TOP}"/>
      <stop offset="0.3" stop-color="${SKY_TOP}"/>
      <stop offset="1" stop-color="${SKY_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#sky)"/>
  <g>
    ${stars()}
  </g>
  <g transform="translate(${offset} ${offset}) scale(${LOGO / 32})">
    ${logoInner}
  </g>
</svg>`;

const scratch = join(tmpdir(), `slabhold-ios-splash-${process.pid}`);
mkdirSync(scratch, { recursive: true });
execSync("npm install --prefix . --no-save --no-package-lock sharp@0.33.5", {
  cwd: scratch,
  stdio: "inherit",
});

const require = createRequire(join(scratch, "package.json"));
const sharp = require("sharp");

// Opaque RGB (no alpha channel), flattened onto the sky's top colour.
const png = await sharp(Buffer.from(splashSvg))
  .flatten({ background: SKY_TOP })
  .removeAlpha()
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer();

for (const name of outNames) writeFileSync(join(imagesetDir, name), png);

// Preview: what a 390×844pt iPhone shows (aspect-fill crop), at 2x.
mkdirSync(previewDir, { recursive: true });
const visible = Math.round((SIZE * 390) / 844);
const preview = await sharp(png)
  .extract({ left: Math.round((SIZE - visible) / 2), top: 0, width: visible, height: SIZE })
  .resize(780, 1688)
  .webp({ quality: 90 })
  .toBuffer();
writeFileSync(join(previewDir, "splash-390.webp"), preview);

const meta = await sharp(png).metadata();
console.log(
  `Wrote ${outNames.length} × ${png.length} bytes (${meta.width}x${meta.height}, channels=${meta.channels}, alpha=${meta.hasAlpha}) and a ${preview.length}-byte preview`,
);
