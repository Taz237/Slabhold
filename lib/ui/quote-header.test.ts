import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { QUOTE_HEADER } from "./quote-header";

const classes = (value: string) => value.split(/\s+/);

describe("quoted post header", () => {
  it("is one row that never wraps", () => {
    const row = classes(QUOTE_HEADER.row);
    for (const name of ["flex", "flex-nowrap", "whitespace-nowrap", "min-w-0", "overflow-hidden"]) {
      assert.ok(row.includes(name), name);
    }
    assert.ok(!row.includes("flex-wrap"));
  });

  it("truncates the name first, keeping a few letters, then the handle", () => {
    const weight = (list: string[]) => {
      const arbitrary = list.find((value) => /^shrink-\[\d+\]$/.test(value));
      if (arbitrary) return Number(arbitrary.slice(8, -1));
      return list.includes("shrink") ? 1 : 0;
    };
    const name = classes(QUOTE_HEADER.name);
    const handle = classes(QUOTE_HEADER.handle);
    assert.ok(name.includes("truncate") && handle.includes("truncate"));
    assert.ok(weight(name) >= 50 * weight(handle) && weight(handle) > 0, "the name gives way first");
    assert.ok(name.some((value) => /^min-w-\[[4-6]ch\]$/.test(value)), "about 4 letters of the name stay");
    assert.ok(handle.some((value) => /^min-w-\[[3-5]ch\]$/.test(value)), "the handle never shrinks to a bare @");
    assert.ok(!name.some((value) => value.startsWith("max-w-")));
  });

  it("never shrinks or wraps the time", () => {
    const time = classes(QUOTE_HEADER.time);
    assert.ok(time.includes("shrink-0") && time.includes("whitespace-nowrap"));
    assert.ok(!time.includes("truncate"));
  });

  it("is what the embed draws, in the feed and in the composer", () => {
    const embed = readFileSync(join(process.cwd(), "components/quoted-post-embed.tsx"), "utf8");
    assert.match(embed, /className=\{QUOTE_HEADER\.row\}/);
    assert.match(embed, /className=\{QUOTE_HEADER\.name\}/);
    assert.match(embed, /className=\{QUOTE_HEADER\.handle\}/);
    assert.match(embed, /className=\{QUOTE_HEADER\.time\}/);
    assert.doesNotMatch(embed, /flex-wrap items-baseline/);
    // The composer keeps the header clear of the remove button.
    assert.match(embed, /className="mt-0 pr-10"/);
  });
});
