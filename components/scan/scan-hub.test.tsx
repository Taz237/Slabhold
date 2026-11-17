import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import type { ScanMatch, ScanMatchResult } from "@/lib/scan/match";
import type { ScanCapture, ScanPurpose } from "@/lib/scan/session";
import type { ScanHubDeps } from "./scan-hub";

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000/scan" });
const win = dom.window;

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("self", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("HTMLInputElement", win.HTMLInputElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("sessionStorage", win.sessionStorage);
expose("IS_REACT_ACT_ENVIRONMENT", true);

const pushed: string[] = [];
const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push(href: string) {
    pushed.push(href);
  },
  replace() {},
  prefetch() {},
};

let ScanHub: ComponentType<{ purpose: ScanPurpose; start?: "camera" | "library"; deps?: Partial<ScanHubDeps> }>;
let fixtures: typeof import("@/lib/scan/preview-fixtures");

before(async () => {
  ({ ScanHub } = await import("./scan-hub"));
  fixtures = await import("@/lib/scan/preview-fixtures");
});

after(() => win.close());

/** A made-up capture: what the native scanner would send for a slab. */
const CAPTURE: ScanCapture = {
  lines: ["PSA", "2018 PANINI PRIZM #280", "LUKA DONCIC", "SILVER PRIZM", "GEM MT 10", "00000000"],
  backLines: null,
  image: null,
  kind: "slab",
};

function result(matches: ScanMatch[]): ScanMatchResult {
  return { matches, settled: true };
}

async function mount(purpose: ScanPurpose, deps: Partial<ScanHubDeps>) {
  pushed.length = 0;
  win.sessionStorage.clear();
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AppRouterContext.Provider, { value: router }, createElement(ScanHub, { purpose, deps })));
  });
  return {
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function text(): string {
  return win.document.body.textContent ?? "";
}

function button(name: string): HTMLElement {
  const found = [...win.document.querySelectorAll("button, a")].find(
    (node) => node.getAttribute("aria-label") === name || node.textContent?.trim() === name,
  );
  assert.ok(found, `control ${name}`);
  return found as HTMLElement;
}

async function waitFor(check: () => boolean, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  throw new Error(text().slice(0, 600));
}

function nativeDeps(overrides: Partial<ScanHubDeps> = {}): Partial<ScanHubDeps> {
  return {
    scannerAvailable: async () => true,
    scan: async () => CAPTURE,
    pickAndRead: async () => CAPTURE,
    identify: async () => result([fixtures.PREVIEW_SLAB]),
    compLookup: fixtures.previewCompLookup,
    solds: fixtures.previewSolds,
    online: () => true,
    ...overrides,
  };
}

describe("ScanHub with the native scanner", () => {
  it("opens the camera on arrival, then one tap adds the card", async () => {
    let scans = 0;
    const view = await mount("add", nativeDeps({ scan: async () => (scans++, CAPTURE) }));
    try {
      await waitFor(() => text().includes("Is this your card?"));
      assert.equal(scans, 1, "no tap needed to open the camera");
      await act(async () => button("Yes, add it").click());
      assert.match(pushed[0] ?? "", /^\/cards\/new\?scan=[a-z0-9]+$/);
      const stored = JSON.parse(win.sessionStorage.getItem("cardflip.scan-match") ?? "{}");
      assert.equal(stored.autoSave, true);
      assert.equal(stored.grade.certNumber, "00000000");
      assert.equal(pushed[0]?.includes("00000000"), false, "the cert never goes in the URL");
    } finally {
      view.unmount();
    }
  });

  it("goes from snap to sold prices with no tap in comp mode", async () => {
    const view = await mount("comp", nativeDeps());
    try {
      await waitFor(() => text().includes("Based on 6 sales"));
      assert.ok(text().includes("Recent sold prices"));
    } finally {
      view.unmount();
    }
  });

  it("lands on the hub with a Scan a card button after a cancel", async () => {
    let scans = 0;
    const view = await mount("add", nativeDeps({ scan: async () => (scans++, null) }));
    try {
      await waitFor(() => scans === 1);
      assert.equal(win.document.querySelector('[role="dialog"]'), null);
      assert.ok(text().includes("Scan as many cards as you want."));
      await act(async () => button("Scan a card").click());
      await waitFor(() => scans === 2);
    } finally {
      view.unmount();
    }
  });

  it("says when it could not read the card", async () => {
    const view = await mount("add", nativeDeps({ scan: async () => Promise.reject(new Error("camera")) }));
    try {
      await waitFor(() => text().includes("We couldn't read that one"));
    } finally {
      view.unmount();
    }
  });

  it("says the camera is off, with Open Settings, when camera access is denied", async () => {
    let opened = 0;
    const view = await mount(
      "add",
      nativeDeps({ scan: async () => "denied", canOpenSettings: async () => true, openSettings: async () => void opened++ }),
    );
    try {
      await waitFor(() => text().includes("Camera is off for Slabhold"));
      assert.equal(win.document.querySelector('[role="dialog"]'), null);
      await waitFor(() => [...win.document.querySelectorAll("button")].some((node) => node.textContent?.trim() === "Open Settings"));
      await act(async () => button("Open Settings").click());
      assert.equal(opened, 1);
      // The other ways in stay.
      button("Choose a photo");
      button("Type it instead");
    } finally {
      view.unmount();
    }
  });

  it("on a build that can't open Settings, says where to go and shows no dead button", async () => {
    const view = await mount("comp", nativeDeps({ scan: async () => "denied", canOpenSettings: async () => false }));
    try {
      await waitFor(() => text().includes("Camera is off for Slabhold"));
      assert.ok(text().includes("Settings app"));
      assert.equal([...win.document.querySelectorAll("button")].some((node) => node.textContent?.trim() === "Open Settings"), false);
    } finally {
      view.unmount();
    }
  });

  it("clears the camera-off note once a scan goes through", async () => {
    let scans = 0;
    const view = await mount("add", nativeDeps({ scan: async () => (scans++ === 0 ? "denied" : CAPTURE), canOpenSettings: async () => true }));
    try {
      await waitFor(() => text().includes("Camera is off for Slabhold"));
      await act(async () => button("Scan a card").click());
      await waitFor(() => text().includes("Is this your card?"));
      assert.equal(text().includes("Camera is off for Slabhold"), false);
    } finally {
      view.unmount();
    }
  });

  it("says offline when the search fails offline", async () => {
    const view = await mount("add", nativeDeps({ identify: async () => null, online: () => false }));
    try {
      await waitFor(() => text().includes("You're offline"));
    } finally {
      view.unmount();
    }
  });

  it("reads a library photo the same way", async () => {
    let reads = 0;
    const view = await mount("add", nativeDeps({ scan: async () => null, pickAndRead: async () => (reads++, CAPTURE) }));
    try {
      await waitFor(() => text().includes("Choose a photo"));
      await act(async () => button("Choose a photo").click());
      await waitFor(() => text().includes("Is this your card?"));
      assert.equal(reads, 1);
    } finally {
      view.unmount();
    }
  });
});

describe("ScanHub: identify, then last eBay solds", () => {
  it("shows the card first, then fills in its last solds", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const view = await mount(
      "add",
      nativeDeps({
        solds: async (capture, matches) => {
          await gate;
          return fixtures.previewSolds(capture, matches);
        },
      }),
    );
    try {
      await waitFor(() => text().includes("Looking up last solds…"));
      assert.ok(text().includes("Luka Doncic"), "the identity shows while the search runs");
      release();
      await waitFor(() => text().includes("Last sold"));
    } finally {
      view.unmount();
    }
  });

  it("a card the catalog didn't find can still be found by the sold titles", async () => {
    const view = await mount(
      "comp",
      nativeDeps({
        identify: async () => result([]),
        solds: async () => ({ matches: [fixtures.PREVIEW_SLAB], comp: { status: "none", searched: true }, query: "q" }),
      }),
    );
    try {
      await waitFor(() => text().includes("No sales yet"));
      assert.ok(text().includes("Luka Doncic"));
    } finally {
      view.unmount();
    }
  });

  it("Is this Sapphire? reads the same scan again as Sapphire and re-runs the solds lookup", async () => {
    const identified: string[][] = [];
    const looked: string[][] = [];
    const sapphire = (lines: readonly string[]) => lines.some((line) => /sapphire/i.test(line));
    const view = await mount(
      "add",
      nativeDeps({
        settle: async (capture) => capture,
        identify: async (capture) => {
          identified.push([...capture.lines]);
          return result([sapphire(capture.lines) ? fixtures.PREVIEW_SAPPHIRE : fixtures.PREVIEW_SAPPHIRE_ASK]);
        },
        solds: async (capture) => {
          looked.push([...capture.lines]);
          return { matches: [sapphire(capture.lines) ? { ...fixtures.PREVIEW_SAPPHIRE, setSource: undefined } : fixtures.PREVIEW_SAPPHIRE_ASK], comp: { status: "none", searched: true }, query: "q" };
        },
      }),
    );
    try {
      await waitFor(() => text().includes("Is this Sapphire?"));
      assert.ok(text().includes("2026 Bowman U Chrome #BCP-68"));
      await act(async () => {
        button("Is this Sapphire?").click();
      });
      await waitFor(() => text().includes("Bowman U Chrome Sapphire #BCP-68"));
      // The same scan, with SAPPHIRE added once: read again and looked up again.
      assert.equal(identified.length, 2);
      assert.equal(looked.length, 2);
      assert.deepEqual(identified[1], [...identified[0], "SAPPHIRE"]);
      assert.deepEqual(looked[1], identified[1]);
      assert.equal(text().includes("Is this Sapphire?"), false);
    } finally {
      view.unmount();
    }
  });

  it("with nothing found either way, says so", async () => {
    const view = await mount(
      "add",
      nativeDeps({ identify: async () => result([]), solds: async () => ({ matches: [], comp: { status: "none" }, query: null }) }),
    );
    try {
      await waitFor(() => text().includes("We couldn't find this one yet"));
    } finally {
      view.unmount();
    }
  });
});

describe("ScanHub without the native scanner", () => {
  it("says reading is coming and keeps the photo and search ways in", async () => {
    let scans = 0;
    const view = await mount("add", { scannerAvailable: async () => false, scan: async () => (scans++, CAPTURE) });
    try {
      await waitFor(() => text().includes("Card reading is coming to the iPhone app"));
      assert.equal(scans, 0);
      assert.equal(button("Type it instead").getAttribute("href"), "/cards/new");
      assert.ok(button("Choose a photo"));
    } finally {
      view.unmount();
    }
  });

  it("sends comp to the search by name", async () => {
    const view = await mount("comp", { scannerAvailable: async () => false });
    try {
      await waitFor(() => text().includes("Find it by name"));
      assert.equal(button("Find it by name").getAttribute("href"), "/comp");
    } finally {
      view.unmount();
    }
  });
});

describe("ScanHub in the iPhone app when the scanner didn't load", () => {
  it("says the scanner couldn't start, not that it's coming", async () => {
    const view = await mount("add", { scannerAvailable: async () => false, nativeApp: () => true });
    try {
      await waitFor(() => text().includes("The scanner couldn't start."));
      assert.equal(text().includes("coming to the iPhone app"), false);
      assert.ok(button("Choose a photo"));
    } finally {
      view.unmount();
    }
  });
});

describe("ScanHub from the Add card sheet's Upload photo", () => {
  it("opens the library on arrival instead of the camera, into the same reveal", async () => {
    let scans = 0;
    let reads = 0;
    pushed.length = 0;
    win.sessionStorage.clear();
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    const deps = nativeDeps({ scan: async () => (scans++, CAPTURE), pickAndRead: async () => (reads++, CAPTURE) });
    await act(async () => {
      root.render(
        createElement(AppRouterContext.Provider, { value: router }, createElement(ScanHub, { purpose: "add", start: "library", deps })),
      );
    });
    try {
      await waitFor(() => text().includes("Is this your card?"));
      assert.equal(reads, 1);
      assert.equal(scans, 0, "the camera stays closed");
      assert.ok(win.document.querySelector('[data-reveal="scan-card"]'), "the same flip-in reveal");
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});

describe("ScanHub: a slab's version picked from \"Which version?\"", () => {
  /** Two rows for a label that named no parallel. Made-up players. */
  function rows(): ScanMatch[] {
    const first = fixtures.PREVIEW_SLAB_VERSION;
    const second: ScanMatch = {
      ...first,
      catalogId: "fixture-second",
      playerName: "Second Player",
      cardNumber: "307",
      parallelOptions: [
        { name: "Base", serialRun: null },
        { name: "X-Fractor", serialRun: null },
        { name: "Gold", serialRun: 50 },
      ],
    };
    return [first, second];
  }

  const waiting = (matches: ScanMatch[]) => ({ matches, comp: { status: "version" as const }, query: null });
  const pressed = (name: string) => button(name).getAttribute("aria-pressed") === "true";
  const promote = async (player: string) => {
    const row = [...win.document.querySelectorAll("button")].find((node) => node.textContent?.includes(player) && node.textContent?.includes("#"));
    assert.ok(row, `row ${player}`);
    await act(async () => (row as HTMLElement).click());
  };

  it("keeps the promoted row and the pick through the read, and a failed read says unavailable instead of losing the sheet", async () => {
    const reads: { lines: string[]; rows: ScanMatch[] }[] = [];
    const view = await mount(
      "add",
      nativeDeps({
        identify: async () => result(rows()),
        solds: async (capture, matches) => {
          reads.push({ lines: capture.lines, rows: matches });
          return reads.length === 1 ? waiting(matches) : null;
        },
      }),
    );
    try {
      await waitFor(() => text().includes("Pick the version to see its sold prices"));
      await promote("Second Player");
      await act(async () => button("X-Fractor").click());
      await waitFor(() => reads.length === 2 && text().includes("We couldn't load sold prices"));
      // The read was the label plus the pick, for the row the collector promoted.
      assert.equal(reads[1].lines.at(-1), "X-FRACTOR");
      assert.equal(reads[1].rows[0].playerName, "Second Player");
      assert.equal(reads[1].rows[0].parallel, "X-Fractor");
      // The sheet is still theirs: same row on top, the pick kept, nothing re-asked.
      assert.match(text(), /Second Player/);
      assert.equal(pressed("X-Fractor"), true);
      assert.doesNotMatch(text(), /Which version\?/);
      assert.ok(!text().includes("We couldn't find this one yet"));
    } finally {
      view.unmount();
    }
  });

  it("offline: no read is tried, the pick stays, and sold prices say unavailable", async () => {
    let onlineChecks = 0;
    let reads = 0;
    const view = await mount(
      "add",
      nativeDeps({
        identify: async () => result(rows()),
        online: () => onlineChecks++ < 1,
        solds: async (_capture, matches) => (reads++, waiting(matches)),
      }),
    );
    try {
      await waitFor(() => text().includes("Pick the version to see its sold prices"));
      await act(async () => button("Refractor").click());
      await waitFor(() => text().includes("We couldn't load sold prices"));
      assert.equal(reads, 1, "no second read while offline");
      assert.equal(pressed("Refractor"), true);
      assert.match(text(), /Fixture Player/);
    } finally {
      view.unmount();
    }
  });

  it("a serial typed while the read runs is still there when its sold prices land", async () => {
    let release: (value: unknown) => void = () => {};
    let reads = 0;
    const view = await mount(
      "add",
      nativeDeps({
        identify: async () => result(rows()),
        solds: async (_capture, matches) => {
          reads += 1;
          if (reads === 1) return waiting(matches);
          await new Promise((resolve) => (release = resolve));
          const top = { ...matches[0], parallel: "Gold" };
          return { matches: [top, ...matches.slice(1)], comp: fixtures.PREVIEW_SOLDS.status === "done" ? fixtures.PREVIEW_SOLDS.comp : { status: "none" as const }, query: "fixture" };
        },
      }),
    );
    try {
      await waitFor(() => text().includes("Pick the version to see its sold prices"));
      await promote("Second Player");
      await act(async () => button("Gold, numbered to 50").click());
      await waitFor(() => reads === 2 && Boolean(win.document.querySelector('input[inputmode="numeric"]')));
      const input = win.document.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")?.set?.call(input, "12");
        input.dispatchEvent(new win.Event("input", { bubbles: true }));
      });
      await act(async () => release(null));
      await waitFor(() => text().includes("Last sold"));
      const after = win.document.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
      assert.equal(after.value, "12");
      assert.equal(pressed("Gold, numbered to 50"), true);
      assert.match(text(), /Second Player/);
    } finally {
      view.unmount();
    }
  });
});

describe("ScanHub: picking another version after a read", () => {
  const rowsFor = () => [fixtures.PREVIEW_SLAB_VERSION];
  const waiting = (matches: ScanMatch[]) => ({ matches, comp: { status: "version" as const }, query: null });
  const priced = (matches: ScanMatch[], cents: number, label: string) => ({
    matches,
    comp: { status: "ok" as const, sales: [{ priceCents: cents, soldAt: "2026-11-10" }], nSales: 1, medianCents: null, lowCents: null, highCents: null, trend: null, asOf: null, source: "live" as const, parallel: label },
    query: "fixture",
  });
  const pressed = (name: string) => button(name).getAttribute("aria-pressed") === "true";

  it("X-Fractor priced, then Base picked: a new read runs for Base, and X-Fractor's price never shows under Base", async () => {
    const reads: string[] = [];
    let releaseBase: () => void = () => {};
    const view = await mount(
      "add",
      nativeDeps({
        identify: async () => result(rowsFor()),
        solds: async (capture, matches) => {
          const last = capture.lines.at(-1) ?? "";
          reads.push(last);
          if (reads.length === 1) return waiting(matches);
          if (last === "X-FRACTOR") return priced(matches, 15000, "X-Fractor");
          await new Promise<void>((resolve) => (releaseBase = resolve));
          return priced(matches, 6000, "Base");
        },
      }),
    );
    try {
      await waitFor(() => text().includes("Pick the version to see its sold prices"));
      await act(async () => button("X-Fractor").click());
      await waitFor(() => text().includes("$150"));
      await act(async () => button("Base").click());
      await waitFor(() => reads.length === 3);
      assert.equal(reads[2], "BASE", "the label is read again with Base, not with X-Fractor");
      assert.equal(pressed("Base"), true);
      assert.doesNotMatch(text(), /\$150/, "X-Fractor's price never shows under Base");
      await act(async () => releaseBase());
      await waitFor(() => text().includes("$60"));
      assert.doesNotMatch(text(), /\$150/);
      assert.equal(pressed("Base"), true);
    } finally {
      view.unmount();
    }
  });

  it("a failed read, then the same pick again, tries the read again", async () => {
    const reads: string[] = [];
    const view = await mount(
      "add",
      nativeDeps({
        identify: async () => result(rowsFor()),
        solds: async (capture, matches) => {
          reads.push(capture.lines.at(-1) ?? "");
          if (reads.length === 1) return waiting(matches);
          if (reads.length === 2) return null;
          return priced(matches, 15000, "X-Fractor");
        },
      }),
    );
    try {
      await waitFor(() => text().includes("Pick the version to see its sold prices"));
      await act(async () => button("X-Fractor").click());
      await waitFor(() => text().includes("We couldn't load sold prices"));
      await act(async () => button("X-Fractor").click());
      await waitFor(() => text().includes("$150"));
      assert.deepEqual(reads.slice(1), ["X-FRACTOR", "X-FRACTOR"]);
      assert.equal(pressed("X-Fractor"), true);
    } finally {
      view.unmount();
    }
  });

  it("a failed read, then another version, reads that one", async () => {
    const reads: string[] = [];
    const view = await mount(
      "comp",
      nativeDeps({
        identify: async () => result(rowsFor()),
        solds: async (capture, matches) => {
          reads.push(capture.lines.at(-1) ?? "");
          if (reads.length === 1) return waiting(matches);
          if (reads.length === 2) return null;
          return priced(matches, 9500, "Refractor");
        },
      }),
    );
    try {
      await waitFor(() => text().includes("Pick the version to see its sold prices"));
      await act(async () => button("X-Fractor").click());
      await waitFor(() => reads.length === 2 && text().includes("We couldn't load sold prices"));
      await act(async () => button("Refractor").click());
      await waitFor(() => reads.length === 3);
      assert.equal(reads[2], "REFRACTOR");
    } finally {
      view.unmount();
    }
  });
});

describe("ScanHub comp: a grade change after a version read", () => {
  it("looks the new grade up as before, for the version read", async () => {
    const lookups: { parallel: string; grade: string }[] = [];
    let reads = 0;
    const view = await mount(
      "comp",
      nativeDeps({
        identify: async () => result([fixtures.PREVIEW_SLAB_VERSION]),
        compLookup: async (identity) => (lookups.push({ parallel: identity.parallel, grade: identity.grade }), { status: "none" }),
        solds: async (_capture, matches) => {
          reads += 1;
          if (reads === 1) return { matches, comp: { status: "version" as const }, query: null };
          return {
            matches,
            comp: { status: "ok" as const, sales: [{ priceCents: 15000, soldAt: "2026-11-10" }], nSales: 1, medianCents: null, lowCents: null, highCents: null, trend: null, asOf: null, source: "live" as const, parallel: "X-Fractor" },
            query: "fixture",
          };
        },
      }),
    );
    try {
      await waitFor(() => text().includes("Pick the version to see its sold prices"));
      await act(async () => button("X-Fractor").click());
      await waitFor(() => text().includes("$150"));
      assert.equal(lookups.length, 0);
      const nine = [...win.document.querySelectorAll("button")].find((node) => node.textContent?.trim() === "PSA 9");
      assert.ok(nine);
      await act(async () => (nine as HTMLElement).click());
      await waitFor(() => lookups.length === 1);
      assert.deepEqual(lookups[0], { parallel: "X-Fractor", grade: "PSA 9" });
      assert.equal(reads, 2, "a grade change is a lookup, not another read");
    } finally {
      view.unmount();
    }
  });
});

describe("ScanHub: Flip it over", () => {
  const FRONT: ScanCapture = { lines: ["JAXSON DART", "NEW YORK GIANTS"], backLines: null, image: null, kind: "card" };
  const BACK: ScanCapture = { lines: ["No. 306", "© 2025 THE TOPPS COMPANY"], backLines: null, image: null, kind: "card" };
  const open = () => ({ ...fixtures.PREVIEW_RAW[0], grade: null, cardNumber: "" });
  const pinned = () => ({ ...fixtures.PREVIEW_RAW[0], grade: null, cardNumber: "306", sureness: { ...fixtures.PREVIEW_RAW[0].sureness, year: "sure" as const, set: "likely" as const, number: "sure" as const } });

  function flipDeps(seen: { identified: ScanCapture[]; sold: ScanCapture[]; scans: number }, overrides: Partial<ScanHubDeps> = {}) {
    return nativeDeps({
      scannerAvailable: async () => true,
      pickAndRead: async () => FRONT,
      scan: async () => {
        seen.scans += 1;
        return BACK;
      },
      identify: async (capture) => {
        seen.identified.push(capture);
        return result([capture.backLines?.length ? pinned() : open()]);
      },
      solds: async (capture, matches) => {
        seen.sold.push(capture);
        return fixtures.previewSolds(capture, matches);
      },
      ...overrides,
    });
  }

  async function mountLibrary(deps: Partial<ScanHubDeps>) {
    pushed.length = 0;
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(AppRouterContext.Provider, { value: router }, createElement(ScanHub, { purpose: "add", start: "library", deps })));
    });
    return { unmount: () => (act(() => root.unmount()), host.remove()) };
  }

  it("a front that can't pin the card asks for the back, with no sold search yet; one tap scans it and both sides are read together", async () => {
    const seen = { identified: [] as ScanCapture[], sold: [] as ScanCapture[], scans: 0 };
    const view = await mountLibrary(flipDeps(seen));
    try {
      await waitFor(() => text().includes("Flip it over"));
      assert.ok(text().includes("Card #"), "says what's still missing");
      assert.equal(seen.sold.length, 0, "no sold search before the back");
      await act(async () => button("Scan the back").click());
      await waitFor(() => seen.sold.length > 0);
      assert.equal(seen.scans, 1);
      assert.deepEqual(seen.identified[1].lines, FRONT.lines);
      assert.deepEqual(seen.identified[1].backLines, BACK.lines);
      assert.deepEqual(seen.sold[0].backLines, BACK.lines);
      await waitFor(() => !text().includes("Flip it over"));
    } finally {
      view.unmount();
    }
  });

  it("Skip goes on with the front as read: its sold search runs and no camera opens", async () => {
    const seen = { identified: [] as ScanCapture[], sold: [] as ScanCapture[], scans: 0 };
    const view = await mountLibrary(flipDeps(seen));
    try {
      await waitFor(() => text().includes("Flip it over"));
      await act(async () => button("Skip the back and use the front").click());
      await waitFor(() => seen.sold.length > 0);
      assert.equal(seen.scans, 0);
      assert.equal(seen.identified.length, 1);
      assert.equal(seen.sold[0].backLines, null);
      await waitFor(() => !text().includes("Flip it over"));
    } finally {
      view.unmount();
    }
  });

  it("a cancelled back scan keeps the step, so Skip is still one tap away", async () => {
    const seen = { identified: [] as ScanCapture[], sold: [] as ScanCapture[], scans: 0 };
    const view = await mountLibrary(
      flipDeps(seen, {
        scan: async () => {
          seen.scans += 1;
          return null;
        },
      }),
    );
    try {
      await waitFor(() => text().includes("Flip it over"));
      await act(async () => button("Scan the back").click());
      await waitFor(() => seen.scans === 1);
      assert.ok(text().includes("Flip it over"));
      assert.equal(seen.sold.length, 0);
    } finally {
      view.unmount();
    }
  });

  it("a front that already pins the card goes straight to the card, as before", async () => {
    const seen = { identified: [] as ScanCapture[], sold: [] as ScanCapture[], scans: 0 };
    const view = await mountLibrary(flipDeps(seen, { identify: async (capture) => (seen.identified.push(capture), result([pinned()])) }));
    try {
      await waitFor(() => seen.sold.length > 0);
      assert.ok(!text().includes("Flip it over"));
    } finally {
      view.unmount();
    }
  });

  it("never asks twice: the phone's camera already asked for this front's back and it was skipped", async () => {
    const seen = { identified: [] as ScanCapture[], sold: [] as ScanCapture[], scans: 0 };
    let first = true;
    const view = await mount(
      "add",
      flipDeps(seen, {
        scan: async () => {
          seen.scans += 1;
          if (!first) return BACK;
          first = false;
          return FRONT;
        },
      }),
    );
    try {
      await waitFor(() => seen.sold.length > 0);
      assert.ok(!text().includes("Flip it over"));
      assert.equal(seen.scans, 1);
    } finally {
      view.unmount();
    }
  });
});
