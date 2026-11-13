import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// Small gray labels on / and /welcome sit over the galaxy. zinc-500 there is
// about 3.7:1, under the 4.5:1 text minimum; zinc-400 clears it.
const LANDING_TEXT_FILES = [
  "components/landing-page.tsx",
  "components/landing/feature-panels.tsx",
  "components/landing/hero-slabs.tsx",
  "components/landing/founder-note.tsx",
  "components/landing/landing-links.tsx",
  "components/landing/showcase/timeline-demo.tsx",
  "components/landing/showcase/graphs-demo.tsx",
  "components/landing/showcase/quick-comp-demo.tsx",
  "components/landing/showcase/badge-popup.tsx",
  "components/landing/hero-phone.tsx",
  "components/landing/app-store-badge.tsx",
  "components/landing/showcase/scan-demo.tsx",
  "components/landing/showcase/scan-result-demo.tsx",
  "components/landing/showcase/sold-panel.tsx",
  "components/landing/showcase/leaderboard-demo.tsx",
];

function textZinc500(source: string) {
  // Text color only. The quick comp search icon is a graphic (3:1 bar), not text.
  return source
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => /(?<![\w:-])text-zinc-500\b/.test(line) && !/<Search\b/.test(line));
}

describe("landing label contrast", () => {
  for (const file of LANDING_TEXT_FILES) {
    it(`${file} has no zinc-500 text`, () => {
      const hits = textZinc500(readFileSync(join(process.cwd(), file), "utf8"));
      assert.deepEqual(
        hits.map((h) => `${file}:${h.n}`),
        [],
        "use text-zinc-400 for landing labels so they reach 4.5:1 over the galaxy",
      );
    });
  }
});
