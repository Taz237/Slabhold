import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { saveCompose, saveScan, takeCompose, takeScan } from "./capture";

const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");

function useStore(store: Storage) {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get: () => store,
  });
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "sessionStorage", original);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
});

describe("capture session storage", () => {
  it("saves and consumes scan and compose photos", () => {
    const data = new Map<string, string>();
    useStore({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
      clear: () => data.clear(),
      key: () => null,
      get length() {
        return data.size;
      },
    });

    saveScan("scan-photo");
    assert.equal(takeScan(), "scan-photo");
    assert.equal(takeScan(), null);

    saveCompose("compose-photo");
    assert.equal(takeCompose(), "compose-photo");
    assert.equal(takeCompose(), null);
  });

  it("does not throw when sessionStorage throws", () => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });

    assert.doesNotThrow(() => saveScan("scan-photo"));
    assert.doesNotThrow(() => saveCompose("compose-photo"));
    assert.equal(takeScan(), null);
    assert.equal(takeCompose(), null);
  });

  it("returns null when reading or writing the store throws", () => {
    useStore({
      getItem() {
        throw new Error("get");
      },
      setItem() {
        throw new Error("set");
      },
      removeItem() {
        throw new Error("remove");
      },
      clear() {},
      key: () => null,
      get length() {
        return 0;
      },
    });

    assert.doesNotThrow(() => saveScan("scan-photo"));
    assert.doesNotThrow(() => saveCompose("compose-photo"));
    assert.equal(takeScan(), null);
    assert.equal(takeCompose(), null);
  });
});
