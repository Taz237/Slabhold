/**
 * Guard first-load JS on the key routes.
 *
 * Reads .next/diagnostics/route-bundle-stats.json from `next build`, gzips each
 * first-load chunk of the guarded routes, and compares the total to
 * bundle-baseline.json. Exit 1 when a route grows more than TOLERANCE over its
 * baseline, or when the build output or the baseline is missing.
 *
 * `node scripts/check-bundle-size.mjs --write` records the current sizes as
 * the new baseline. Other routes are printed for reference only.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

/** Allowed growth over the baseline: 10%. */
export const TOLERANCE = 0.1;

/**
 * Routes that fail the check. /welcome is signed-out Home (proxy.ts serves it
 * at /), the first screen most visitors see; / is signed-in Home; /posts/[id]
 * is a shared post, opened cold from a link.
 */
export const GUARDED_ROUTES = [
  "/welcome",
  "/",
  "/collection",
  "/cards/[id]",
  "/u/[username]/cards/[id]",
  "/posts/[id]",
];

/** Printed for reference, never failed on. */
export const REPORTED_ROUTES = ["/login"];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const statsPath = join(root, ".next", "diagnostics", "route-bundle-stats.json");
const baselinePath = join(root, "bundle-baseline.json");

/** Gzipped bytes of one route's first-load JS. `read` returns a chunk's bytes by its path. */
export function firstLoadGzip(stats, route, read) {
  const entry = stats.find((item) => item.route === route);
  if (!entry) throw new Error(`No bundle stats for ${route}. Run npm run build first.`);
  let total = 0;
  for (const chunk of entry.firstLoadChunkPaths) total += gzipSync(read(chunk), { level: 9 }).length;
  return total;
}

/** Routes over budget, as { route, actual, baseline, limit }. A route with no baseline fails. */
export function overBudget(actual, baseline, tolerance = TOLERANCE) {
  const over = [];
  for (const [route, bytes] of Object.entries(actual)) {
    const base = baseline[route];
    const limit = typeof base === "number" && base > 0 ? Math.floor(base * (1 + tolerance)) : 0;
    if (bytes > limit) over.push({ route, actual: bytes, baseline: base ?? null, limit });
  }
  return over;
}

export function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function main(argv) {
  const write = argv.includes("--write");
  if (!existsSync(statsPath)) {
    console.error(`Missing ${statsPath}. Run npm run build first.`);
    return 1;
  }
  const stats = JSON.parse(readFileSync(statsPath, "utf8"));
  const read = (chunk) => readFileSync(join(root, chunk));

  const actual = {};
  for (const route of GUARDED_ROUTES) actual[route] = firstLoadGzip(stats, route, read);

  for (const route of REPORTED_ROUTES) {
    if (!stats.some((item) => item.route === route)) continue;
    console.log(`  ${route}: ${kb(firstLoadGzip(stats, route, read))} first-load JS (gz), not guarded`);
  }

  if (write) {
    writeFileSync(baselinePath, `${JSON.stringify(actual, null, 2)}\n`);
    for (const [route, bytes] of Object.entries(actual)) console.log(`baseline ${route}: ${kb(bytes)}`);
    return 0;
  }

  if (!existsSync(baselinePath)) {
    console.error(`Missing ${baselinePath}. Run node scripts/check-bundle-size.mjs --write.`);
    return 1;
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  for (const [route, bytes] of Object.entries(actual)) {
    const base = baseline[route];
    console.log(`${route}: ${kb(bytes)} first-load JS (gz), baseline ${base ? kb(base) : "none"}`);
  }
  const over = overBudget(actual, baseline);
  for (const item of over) {
    console.error(
      `${item.route} first-load JS is ${kb(item.actual)}, over the ${kb(item.limit)} limit ` +
        `(baseline ${item.baseline ? kb(item.baseline) : "none"} + ${TOLERANCE * 100}%).`,
    );
  }
  return over.length > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
