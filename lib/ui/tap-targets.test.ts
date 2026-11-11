import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/** Big enough already, or grown to 44px by .hit-44 (app/globals.css). */
const OK =
  /hit-44|min-h-11|min-h-12|min-h-14|(?<![\w:-])h-(?:11|12|13|14|16)(?![\w.])|min-h-\[4[4-9]px\]|h-\[(?:4[4-9]|5\d)px\]|size-11|sr-only/;
/** A height, size or vertical padding that leaves a tap target under 44px. */
const SMALL =
  /(?<![\w:-])(?:h|size)-(?:4|5|6|7|8|9|10)(?![\w.])|(?<![\w:-])h-\[(?:1\d|2\d|3\d|4[0-3])px\]|(?<![\w:-])py-(?:0|0\.5|1|1\.5|2)(?![\w.])/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

/** Images drawn on the server have no taps. */
function isImage(path: string) {
  return /opengraph|twitter-image|og-frame|og-share|\/og\//.test(path);
}

/** Each <button> and <Link> opening tag's className, with its line. */
function targets(source: string): { line: number; className: string }[] {
  const out: { line: number; className: string }[] = [];
  for (const match of source.matchAll(/<(button|Link)\b/g)) {
    let i = match.index! + match[0].length;
    let depth = 0;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) break;
    }
    const attrs = source.slice(match.index!, i);
    const className = /className=(\{`[\s\S]*?`\}|"[^"]*")/.exec(attrs)?.[1];
    if (className) out.push({ line: source.slice(0, match.index).split("\n").length, className });
  }
  return out;
}

describe("tap targets", () => {
  const all = [...files("components"), ...files("app")].filter((path) => !isImage(path));

  it("every button and link is at least 44px to tap", () => {
    const small: string[] = [];
    for (const path of all) {
      for (const target of targets(readFileSync(path, "utf8"))) {
        if (OK.test(target.className)) continue;
        const hit = SMALL.exec(target.className);
        // A full-width row with py-2.5 and text is 44px tall.
        if (!hit || (/block w-full/.test(target.className) && /py-2\.5/.test(target.className))) continue;
        small.push(`${path}:${target.line} (${hit[0]})`);
      }
    }
    assert.deepEqual(small, []);
  });

  it("never puts hit-44 on a positioned element: its position: relative would win", () => {
    const clashes: string[] = [];
    for (const path of all) {
      for (const target of targets(readFileSync(path, "utf8"))) {
        if (/hit-44/.test(target.className) && /(?<![\w:-])(?:absolute|fixed|sticky)\b/.test(target.className)) {
          clashes.push(`${path}:${target.line}`);
        }
      }
    }
    assert.deepEqual(clashes, []);
  });
});
