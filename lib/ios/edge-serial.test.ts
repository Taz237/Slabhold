import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { scanCaptureFrom } from "./scanner";

/**
 * A serial printed sideways up a card's edge ("03/10" in small foil). The phone reads the left
 * and right edge strips again, turned both ways, and keeps only a serial. There is no Swift
 * toolchain in CI, so these read the Swift source: the patterns are pulled out of it and run
 * here, and the box math is repeated in JS beside a check that the Swift says the same.
 */

const APP = "ios-app/ios/App/App";
const reader = readFileSync(join(process.cwd(), `${APP}/CardTextReader.swift`), "utf8");
const camera = readFileSync(join(process.cwd(), `${APP}/CardScannerViewController.swift`), "utf8");

function section(from: string, to: string): string {
  const start = reader.indexOf(from);
  const end = reader.indexOf(to, start + 1);
  assert.ok(start >= 0 && end > start, `${from} … ${to}`);
  return reader.slice(start, end);
}

function swiftPattern(name: string): RegExp {
  const pattern = reader.match(new RegExp(`static let ${name} = #"(.+?)"#`))?.[1];
  assert.ok(pattern, name);
  return new RegExp(pattern);
}

/** The letters the Swift swaps for digits, read from its switch. */
function swaps(): Map<string, string> {
  const body = section("static func edgeDigit", "static func edgeSerial(");
  const out = new Map<string, string>();
  for (const match of body.matchAll(/case ((?:"\w"(?:, )?)+): return "(\d)"/g)) {
    for (const letter of match[1].matchAll(/"(\w)"/g)) out.set(letter[1], match[2]);
  }
  return out;
}

/** CardTextReader.edgeSerial, step for step. */
function edgeSerial(text: string): string | null {
  const trimmed = text.trim();
  if (!swiftPattern("edgeSerialPattern").test(trimmed)) return null;
  const parts = trimmed.split("/").map((part) => part.trim());
  if (parts.length !== 2 || !parts.every((part) => /\d/.test(part))) return null;
  const table = swaps();
  const sides = parts.map((part) => [...part].map((c) => table.get(c) ?? c).join(""));
  const number = Number(sides[0]);
  const run = Number(sides[1]);
  if (!(number >= 1 && run >= 2 && run > number)) return null;
  return `${sides[0]}/${sides[1]}`;
}

type Box = [number, number, number, number];

/** CardTextReader.unturned: a box read in the turned strip, back in the strip as it sat. */
function unturned([x, y, w, h]: Box, clockwise: boolean): Box {
  return clockwise ? [1 - (y + h), x, h, w] : [y, 1 - (x + w), h, w];
}

/** CardTextReader.cropBox: a box in a piece (pixels, origin top left) as a box in the whole crop. */
function cropBox(box: Box, rect: Box, width: number, height: number): Box {
  const left = rect[0] + box[0] * rect[2];
  const bottom = rect[1] + (1 - box[1]) * rect[3];
  return [left / width, 1 - bottom / height, (box[2] * rect[2]) / width, (box[3] * rect[3]) / height];
}

/** Where a point of the strip lands once the strip is turned a quarter turn (both 0...1, y up). */
function turnedPoint([u, v]: [number, number], clockwise: boolean): [number, number] {
  return clockwise ? [v, 1 - u] : [1 - v, u];
}

const round = (box: number[]) => box.map((n) => Number(n.toFixed(6)));

describe("edge serial: what counts as a serial", () => {
  it("keeps a plain serial as printed", () => {
    assert.equal(edgeSerial("03/10"), "03/10");
    assert.equal(edgeSerial("17/99"), "17/99");
    assert.equal(edgeSerial(" 045 / 149 "), "045/149");
    assert.equal(edgeSerial("1/2500"), "1/2500");
  });

  it("fixes Vision's usual mixups only when the shape is right and each side has a real digit", () => {
    assert.deepEqual([...swaps()].sort(), [["I", "1"], ["O", "0"], ["S", "5"], ["l", "1"], ["o", "0"]]);
    assert.equal(edgeSerial("O3/1O"), "03/10");
    assert.equal(edgeSerial("l7/99"), "17/99");
    assert.equal(edgeSerial("2S/7S"), "25/75");
    // Border lines and words read as letters are never a serial.
    for (const text of ["II/III", "IS/SO", "lO/SO", "03/lO", "SO/50"]) assert.equal(edgeSerial(text), null, text);
  });

  it("drops stats, fine print and anything that isn't a whole serial", () => {
    for (const text of [
      "2023 10 2",
      "2023",
      "10",
      "SAM LaPORTA",
      "ROOKIE",
      "© 2024 Panini America, Inc.",
      "No. 131",
      "03/10 LIONS",
      "RC 03/10",
      "12/05/2023",
      "12345/99999",
      "3-10",
      "03/1O0O0",
      "",
    ]) {
      assert.equal(edgeSerial(text), null, text);
    }
  });

  it("drops a run that can't be one: 0 of, out of 1, or more than the run", () => {
    for (const text of ["00/10", "0/25", "1/1", "5/1", "99/10", "10/10", "3/0"]) assert.equal(edgeSerial(text), null, text);
  });

  it("the Swift checks the same things, in the same order", () => {
    const body = section("static func edgeSerial(", "static func unturned");
    assert.match(body, /guard trimmed\.range\(of: edgeSerialPattern, options: \.regularExpression\) != nil else \{ return nil \}/);
    assert.match(body, /guard parts\.count == 2, parts\.allSatisfy\(\{ part in part\.contains\(where: \{ \$0\.isASCII && \$0\.isNumber \}\) \}\) else \{ return nil \}/);
    assert.match(body, /guard let number = Int\(sides\[0\]\), let run = Int\(sides\[1\]\), number >= 1, run >= 2, run > number else \{ return nil \}/);
    assert.match(body, /return sides\[0\] \+ "\/" \+ sides\[1\]/);
    // The whole line, start to end: four characters at most on each side of one slash.
    assert.equal(swiftPattern("edgeSerialPattern").source, String.raw`^[0-9OolIS]{1,4}\s*\/\s*[0-9OolIS]{1,4}$`);
  });
});

describe("edge serial: where the line lands in the crop", () => {
  it("un-turns a box the same way the strip was turned", () => {
    // Any box, either turn: the corners of the un-turned box, turned, are the corners that were read.
    for (const clockwise of [true, false]) {
      const readBox: Box = [0.2, 0.3, 0.5, 0.25];
      const [x, y, w, h] = unturned(readBox, clockwise);
      const corners = ([[x, y], [x + w, y + h]] as [number, number][]).map((p) => turnedPoint(p, clockwise));
      const xs = corners.map((p) => p[0]);
      const ys = corners.map((p) => p[1]);
      assert.deepEqual(round([Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]), round(readBox), String(clockwise));
    }
    assert.match(reader, /\? CGRect\(x: 1 - box\.maxY, y: box\.minX, width: box\.height, height: box\.width\)/);
    assert.match(reader, /: CGRect\(x: box\.minY, y: 1 - box\.maxX, width: box\.height, height: box\.width\)/);
    // The turn itself is an exact quarter turn about the origin (Core Image's y runs up).
    assert.match(reader, /clockwise \? CGAffineTransform\(a: 0, b: -1, c: 1, d: 0, tx: 0, ty: 0\) : CGAffineTransform\(a: 0, b: 1, c: -1, d: 0, tx: 0, ty: 0\)/);
  });

  it('a right-edge "03/10" running up the card lands on the right edge, tall and thin', () => {
    // A 1000 x 1400 crop. The right strip is its last 180 px. The serial runs up the edge from
    // 40% to 60% of the height, so turned clockwise it reads left to right across the middle.
    const strip: Box = [820, 0, 180, 1400];
    const read: Box = [0.4, 0.3, 0.2, 0.4];
    const place = cropBox(unturned(read, true), strip, 1000, 1400);
    assert.deepEqual(round(place), [0.874, 0.4, 0.072, 0.2]);
    assert.ok(place[0] >= 0.82 && place[0] + place[2] <= 1);
    assert.ok(place[3] > place[2]);
  });

  it('a left-edge "17/99" running down the card lands on the left edge, tall and thin', () => {
    const strip: Box = [0, 0, 180, 1400];
    // Turned counterclockwise, a line near the turned strip's left end sits near the card's top.
    const read: Box = [0.1, 0.3, 0.2, 0.4];
    const place = cropBox(unturned(read, false), strip, 1000, 1400);
    assert.deepEqual(round(place), [0.054, 0.7, 0.072, 0.2]);
    assert.ok(place[0] + place[2] <= 0.18);
  });

  it("takes the strips from the crop's left and right, full height", () => {
    const body = section("static func withEdgeSerial", "static func edgeLine");
    assert.match(reader, /static let edgeStrip: CGFloat = 0\.18/);
    assert.match(body, /let side = \(width \* edgeStrip\)\.rounded\(\)/);
    assert.match(body, /CGRect\(x: width - side, y: 0, width: side, height: height\), CGRect\(x: 0, y: 0, width: side, height: height\)/);
    assert.match(body, /for clockwise in \[true, false\]/);
    const line = section("static func edgeLine", "static func agreedSerial");
    assert.match(line, /box: cropBox\(unturned\(line\.box, clockwise: clockwise\), from: rect, in: image\), source: "edge"/);
  });
});

describe("edge serial: when the pass runs and what it may add", () => {
  it("runs after the serial re-reads, only on a raw card's front that has no serial yet", () => {
    assert.match(reader, /static func read\(image: UIImage, frames: \[CGImage\] = \[\], edges: Bool = true\) -> CardRead/);
    const body = section("static func read(", "private final class FrameReads");
    assert.ok(body.indexOf("withSerialRereads(") < body.indexOf("withEdgeSerial("));
    // A slab (by shape or by its label) never gets the pass; nor does a photo with no card edge.
    assert.match(body, /if edges, kind == "card", !label \{\s*details = withEdgeSerial\(details, in: cropped, started: started\)\s*\}/);
    // The back is read without it: the camera says which side this is.
    assert.match(camera, /let isFront = front == nil/);
    assert.match(camera, /CardTextReader\.read\(image: image, frames: frames, edges: isFront\)/);
    const pass = section("static func withEdgeSerial", "static func edgeLine");
    assert.match(pass, /guard !hasSerial\(lines\), CFAbsoluteTimeGetCurrent\(\) - started < rereadBudgetSeconds else \{ return lines \}/);
    const serial = swiftPattern("serialPattern");
    for (const text of ["03/10", "SERIAL 045 / 149", "1/1"]) assert.equal(serial.test(text), true, text);
    for (const text of ["2023 10 2", "SAM LaPORTA", "No. 131"]) assert.equal(serial.test(text), false, text);
  });

  it("has a hard time limit: late reads add nothing", () => {
    assert.match(reader, /static let edgeWaitSeconds: TimeInterval = 0\.15/);
    const pass = section("static func withEdgeSerial", "static func edgeLine");
    assert.match(pass, /guard group\.wait\(timeout: \.now\(\) \+ edgeWaitSeconds\) == \.success else \{ return lines \}/);
    // Four reads at most: two strips, each turned both ways. Each is Vision on the phone.
    assert.equal([...pass.matchAll(/recognizeText\(in:/g)].length, 1);
    assert.equal([...reader.matchAll(/VNRecognizeTextRequest\(\)/g)].length, 1);
  });

  it("adds one line only when every strip read agrees on it, and never replaces a line", () => {
    const pass = section("static func withEdgeSerial", "static func edgeLine");
    assert.match(pass, /guard let serial = agreedSerial\(reads\.all\(\)\.flatMap \{ \$0 \}\) else \{ return lines \}/);
    assert.match(pass, /return lines \+ \[serial\]/);
    assert.doesNotMatch(pass, /merged\(|replacing\(/);
    // Upside down, "06/10" reads "01/90": two different serials means neither is added.
    const agreed = section("static func agreedSerial", "/// A box read inside a cropped piece");
    assert.match(agreed, /guard let best = found\.max\(by: \{ \$0\.confidence < \$1\.confidence \}\) else \{ return nil \}/);
    assert.match(agreed, /return found\.allSatisfy\(\{ \$0\.text == best\.text \}\) \? best : nil/);
    // Nothing but a serial leaves a strip, and what Vision first said rides along as an alternate.
    const line = section("static func edgeLine", "static func agreedSerial");
    assert.match(line, /guard let serial = edgeSerial\(from: line\.text\) else \{ return nil \}/);
    assert.match(line, /alternates: original == serial \? \[\] : \[original\]/);
  });

  it("the web takes an edge line as a normal line", () => {
    const scan = scanCaptureFrom({
      lines: ["ROOKIE", "03/10", "SAM LaPORTA"],
      kind: "card",
      alternates: [[], ["O3/1O"], []],
      confidences: [1, 0.5, 1],
      boxes: [[0.1, 0.9, 0.2, 0.03], [0.874, 0.4, 0.072, 0.2], [0.2, 0.1, 0.5, 0.05]],
      sources: ["card", "edge", "card"],
    });
    assert.deepEqual(scan?.lines, ["ROOKIE", "03/10", "SAM LaPORTA"]);
    assert.deepEqual(scan?.alternates?.[1], ["O3/1O"]);
  });
});
