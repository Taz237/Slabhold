import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { isNativeApp } from "@/lib/ios/platform";

const g = globalThis as { window?: unknown };

describe("isNativeApp", () => {
  afterEach(() => {
    delete g.window;
  });

  it("is false on the server", () => {
    assert.equal(isNativeApp(), false);
  });

  it("is false in a browser, with or without a web Capacitor", () => {
    g.window = {};
    assert.equal(isNativeApp(), false);
    g.window = { Capacitor: { isNativePlatform: () => false } };
    assert.equal(isNativeApp(), false);
  });

  it("is true when the iOS bridge says so", () => {
    g.window = { Capacitor: { isNativePlatform: () => true } };
    assert.equal(isNativeApp(), true);
  });

  it("is false when the bridge throws", () => {
    g.window = {
      Capacitor: {
        isNativePlatform: () => {
          throw new Error("bridge gone");
        },
      },
    };
    assert.equal(isNativeApp(), false);
  });
});
