import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  clearScanMatch,
  readScanMatch,
  saveCompose,
  saveScan,
  saveScanMatch,
  takeCompose,
  takeScan,
} from "./capture";
import { scanHandoffFrom } from "./scan/handoff";
import type { ScanMatch } from "./scan/match";

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

function memoryStore(): { store: Storage; data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    store: {
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
    },
  };
}

/** A made-up slab match. The cert is not a real one. */
function slabMatch(): ScanMatch {
  return {
    catalogId: null,
    playerName: "Luka Doncic",
    sport: "Basketball",
    yearLabel: "2018-19",
    setBrand: "Panini Prizm",
    cardNumber: "280",
    parallel: "Silver",
    serialRun: null,
    serialNo: "",
    isRookie: true,
    isAuto: false,
    grade: { company: "PSA", number: "10", qualifier: "", certNumber: "45678912", authentic: false, autoGrade: "" },
    score: 100,
    sureness: { player: "sure", year: "sure", set: "sure", number: "sure", parallel: "sure" },
    parallelOptions: [],
  };
}

describe("scan match handoff", () => {
  it("hands the match to Add card by scan id, and returns the same object each read", () => {
    const { store } = memoryStore();
    useStore(store);
    clearScanMatch();
    const handoff = scanHandoffFrom(slabMatch(), "scan00000001");
    saveScanMatch(handoff);
    const first = readScanMatch("scan00000001");
    assert.equal(first?.grade?.certNumber, "45678912");
    assert.equal(readScanMatch("scan00000001"), first, "stable for useSyncExternalStore");
  });

  it("ignores a handoff from another scan", () => {
    const { store } = memoryStore();
    useStore(store);
    clearScanMatch();
    saveScanMatch(scanHandoffFrom(slabMatch(), "scan00000001"));
    assert.equal(readScanMatch("scan00000002"), null);
  });

  it("reads a handoff saved before a reload", () => {
    const { store, data } = memoryStore();
    useStore(store);
    clearScanMatch();
    data.set("cardflip.scan-match", JSON.stringify(scanHandoffFrom(slabMatch(), "scan00000003")));
    assert.equal(readScanMatch("scan00000003")?.playerName, "Luka Doncic");
  });

  it("clears the stored cert once Add card is done with it", () => {
    const { store, data } = memoryStore();
    useStore(store);
    saveScanMatch(scanHandoffFrom(slabMatch(), "scan00000004"));
    clearScanMatch();
    assert.equal(data.size, 0);
    assert.equal(readScanMatch("scan00000004"), null);
  });

  it("does not throw when sessionStorage is blocked", () => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    clearScanMatch();
    assert.doesNotThrow(() => saveScanMatch(scanHandoffFrom(slabMatch(), "scan00000005")));
    // The in-memory copy still carries this tab through.
    assert.equal(readScanMatch("scan00000005")?.playerName, "Luka Doncic");
    assert.doesNotThrow(() => clearScanMatch());
  });
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
