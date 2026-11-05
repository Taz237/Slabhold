/**
 * One-shot generator for the iOS app icon and launch splash.
 * Run from ios-app/: node scripts/generate-assets.mjs
 * Uses a temporary sharp install; sharp is not a dependency.
 *
 * Icon: 1024×1024, brand #7C3AED to the edges, no alpha (App Store rule),
 * the logo mark from public/logo.svg on top. iOS rounds the corners itself.
 * Splash: 2732×2732, #09090B with the logo tile centered, as public/logo.svg
 * draws it. The launch screen aspect-fills it, so the tile shows at ~96pt.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const logoSvg = readFileSync(join(here, "..", "public", "logo.svg"), "utf8");
const assets = join(here, "ios", "App", "App", "Assets.xcassets");

const inner = logoSvg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const markOnly = inner.replace(/<rect width="32" height="32"[^>]*\/>/, "");
if (markOnly === inner) throw new Error("Could not find the tile rect in public/logo.svg");

const ICON = 1024;
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#7C3AED"/>${markOnly}
</svg>`;

const SPLASH = 2732;
const TILE = 320;
const offset = (SPLASH - TILE) / 2;
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SPLASH}" height="${SPLASH}" viewBox="0 0 ${SPLASH} ${SPLASH}">
  <rect width="${SPLASH}" height="${SPLASH}" fill="#09090B"/>
  <g transform="translate(${offset} ${offset}) scale(${TILE / 32})">${inner}</g>
</svg>`;

const scratch = join(tmpdir(), `slabhold-ios-assets-${process.pid}`);
mkdirSync(scratch, { recursive: true });
execSync("npm install --prefix . --no-save --no-package-lock sharp@0.33.5", { cwd: scratch, stdio: "inherit" });
const sharp = createRequire(join(scratch, "package.json"))("sharp");

const icon = await sharp(Buffer.from(iconSvg))
  .flatten({ background: "#7C3AED" })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync(join(assets, "AppIcon.appiconset", "AppIcon-512@2x.png"), icon);

const splash = await sharp(Buffer.from(splashSvg))
  .flatten({ background: "#09090B" })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toBuffer();
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  writeFileSync(join(assets, "Splash.imageset", name), splash);
}

for (const [name, buf] of [["icon", icon], ["splash", splash]]) {
  const meta = await sharp(buf).metadata();
  console.log(`${name}: ${meta.width}x${meta.height}, channels=${meta.channels}, alpha=${meta.hasAlpha}, ${buf.length} bytes`);
}
