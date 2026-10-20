/**
 * One-shot generator for app/apple-icon.png (180×180).
 * Run: node scripts/generate-apple-icon.mjs
 * Uses a temporary sharp install; sharp is not a runtime dependency.
 *
 * Solid square: brand #7C3AED to the edges (no transparent corners),
 * with the purple star from public/logo.svg centered on top.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "app");
const outFile = join(outDir, "apple-icon.png");
const logoPath = join(root, "public", "logo.svg");

const SIZE = 180;
const BRAND_BG = "#7C3AED";
const STAR_FILL = "#5B21B6";
const CARD_FILL = "#FFFFFF";
const LABEL_FILL = "#5B21B6";

const logoSvg = readFileSync(logoPath, "utf8");
const pathMatch = logoSvg.match(/<path[^>]*d="([^"]+)"/);
if (!pathMatch) throw new Error("Could not find the star path in public/logo.svg");
const starPath = pathMatch[1];

// Full-bleed brand square (no rx) + logo mark from the 32×32 viewBox, scaled.
const scale = SIZE / 32;
const iconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BRAND_BG}"/>
  <g transform="scale(${scale})">
    <rect x="9" y="3.5" width="14" height="25" rx="2.25" fill="${CARD_FILL}"/>
    <rect x="11.15" y="5.75" width="9.7" height="3.5" rx="0.85" fill="${LABEL_FILL}"/>
    <path fill="${STAR_FILL}" d="${starPath}"/>
  </g>
</svg>`;

const scratch = join(tmpdir(), `slabhold-apple-icon-${process.pid}`);
mkdirSync(scratch, { recursive: true });
execSync("npm install --prefix . --no-save --no-package-lock sharp@0.33.5", {
  cwd: scratch,
  stdio: "inherit",
});

const require = createRequire(join(scratch, "package.json"));
const sharp = require("sharp");
mkdirSync(outDir, { recursive: true });

// Flatten onto opaque brand purple so corner pixels have alpha 255.
const png = await sharp(Buffer.from(iconSvg))
  .resize(SIZE, SIZE)
  .flatten({ background: { r: 124, g: 58, b: 237 } })
  .png({ compressionLevel: 9 })
  .toBuffer();

writeFileSync(outFile, png);

const meta = await sharp(png).metadata();
const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
const channels = info.channels;
const corner = data.subarray(0, channels);
console.log(
  `Wrote ${outFile} (${png.length} bytes, ${meta.width}x${meta.height}, channels=${channels}, cornerRGBA=[${[...corner].join(",")}])`,
);
