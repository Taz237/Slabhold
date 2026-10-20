/**
 * One-shot generator for app/apple-icon.png (180×180).
 * Run: node scripts/generate-apple-icon.mjs
 * Uses a temporary sharp install; sharp is not a runtime dependency.
 *
 * Rasterizes public/logo.svg — purple star on brand background (#7C3AED).
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
const logoSvg = readFileSync(logoPath);

const scratch = join(tmpdir(), `slabhold-apple-icon-${process.pid}`);
mkdirSync(scratch, { recursive: true });
execSync("npm install --prefix . --no-save --no-package-lock sharp@0.33.5", {
  cwd: scratch,
  stdio: "inherit",
});

const require = createRequire(join(scratch, "package.json"));
const sharp = require("sharp");
mkdirSync(outDir, { recursive: true });

// Brand purple from logo.svg background rect (#7C3AED).
const png = await sharp(logoSvg)
  .resize(SIZE, SIZE, {
    fit: "contain",
    background: { r: 124, g: 58, b: 237, alpha: 1 },
  })
  .png()
  .toBuffer();
writeFileSync(outFile, png);
console.log(`Wrote ${outFile} (${png.length} bytes)`);
