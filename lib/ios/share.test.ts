import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isShareAbort } from "@/lib/share/sheet";
import { asShareAbort } from "@/lib/ios/native-helpers";
import { shareFunction } from "@/lib/ios/share";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const g = globalThis as { window?: unknown };

describe("native share", () => {
  afterEach(() => {
    delete g.window;
  });

  it("turns the iOS sheet's Cancel into the web's AbortError", () => {
    assert.equal(isShareAbort(asShareAbort(new Error("Share canceled"))), true);
    assert.equal(isShareAbort(asShareAbort({ message: "Share canceled" })), true);
  });

  it("keeps any other failure as it is, so our own sheet opens", () => {
    const failure = new Error("Can't share");
    assert.equal(asShareAbort(failure), failure);
    assert.equal(isShareAbort(asShareAbort(failure)), false);
  });

  it("uses the native sheet in the app and the browser's elsewhere", () => {
    g.window = { Capacitor: { isNativePlatform: () => true } };
    const native = shareFunction();
    assert.equal(typeof native, "function");
    g.window = {};
    assert.notEqual(shareFunction(), native);
  });

  it("is what every share button calls, and the plugin loads on the tap", () => {
    assert.match(read("components/share-button.tsx"), /share: isNativeApp\(\) \? nativeShare : navigator\.share/);
    assert.match(read("components/share-sheet.tsx"), /shareFunction\(\)/);
    const share = read("lib/ios/share.ts");
    assert.match(share, /\(await loadNative\(\)\)\.shareSheet\(data\)/);
    assert.match(read("lib/ios/native.ts"), /throw asShareAbort\(error\)/);
  });
});
