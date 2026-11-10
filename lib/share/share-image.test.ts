import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { shareImage, type ShareImageDeps, type ShareImageInput } from "@/lib/share/share-image";

type Log = string[];
const g = globalThis as Record<string, unknown>;
const nav = navigator as unknown as Record<string, unknown>;
const NAV_KEYS = ["share", "canShare", "userAgent", "platform", "maxTouchPoints"] as const;

const input = (): ShareImageInput => ({
  blob: new Blob(["png"], { type: "image/png" }),
  filename: "slabhold-collection.png",
  title: "My collection on Slabhold",
  src: "/api/share/collection.png",
  source: "collection",
});

/** A fake page: window.open, a download link, analytics, and the browser's share. */
function fakePage(log: Log, browser: { canShareFiles: boolean; ios: boolean; share?: () => Promise<void> }) {
  g.window = {
    open: (url: string) => {
      log.push(`open ${url}`);
      return null;
    },
    setTimeout: () => 0,
    va: (_kind: string, event: { name: string; data?: Record<string, unknown> }) => log.push(`track ${event.name} ${JSON.stringify(event.data)}`),
  };
  g.document = {
    createElement: () => ({
      click(this: { download: string }) {
        log.push(`download ${this.download}`);
      },
    }),
  };
  for (const key of NAV_KEYS) Object.defineProperty(nav, key, { configurable: true, writable: true, value: undefined });
  nav.userAgent = browser.ios ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" : "Mozilla/5.0 (X11; Linux x86_64)";
  nav.canShare = () => browser.canShareFiles;
  nav.share = async (data: { files: File[]; title: string }) => {
    log.push(`web-share ${data.files[0].name} ${data.title}`);
    await browser.share?.();
  };
}

function native(result: "shared" | "cancelled" | "unavailable", log: Log): ShareImageDeps {
  return {
    isNativeApp: () => true,
    loadNative: async () => ({
      async shareFilesNative({ files }) {
        log.push(`native ${files.map((file) => `${file.name} ${file.type}`).join(",")}`);
        return result;
      },
    }),
  };
}

const web: ShareImageDeps = {
  isNativeApp: () => false,
  loadNative: async () => {
    throw new Error("the web never loads native code");
  },
};

describe("shareImage", () => {
  const saved = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
  beforeEach(() => {
    URL.createObjectURL = () => "blob:fake";
    URL.revokeObjectURL = () => {};
  });
  afterEach(() => {
    delete g.window;
    delete g.document;
    for (const key of NAV_KEYS) delete nav[key];
    URL.createObjectURL = saved.createObjectURL;
    URL.revokeObjectURL = saved.revokeObjectURL;
  });

  it("in the app: the iOS sheet, tracked once when shared", async () => {
    const log: Log = [];
    fakePage(log, { canShareFiles: true, ios: true });
    await shareImage(input(), native("shared", log));
    assert.equal(log[0], "native slabhold-collection.png image/png");
    assert.equal(log.filter((line) => line.startsWith("track share")).length, 1);
    assert.ok(log.every((line) => !line.startsWith("web-share") && !line.startsWith("open")));
  });

  it("in the app: Cancel does nothing more", async () => {
    const log: Log = [];
    fakePage(log, { canShareFiles: true, ios: true });
    await shareImage(input(), native("cancelled", log));
    assert.deepEqual(log, ["native slabhold-collection.png image/png"]);
  });

  it("in the app, builds without the plugin: falls back to today's web branch", async () => {
    const log: Log = [];
    fakePage(log, { canShareFiles: true, ios: true });
    await shareImage(input(), native("unavailable", log));
    assert.equal(log[0], "native slabhold-collection.png image/png");
    assert.equal(log[1], "web-share slabhold-collection.png My collection on Slabhold");
    assert.equal(log.filter((line) => line.startsWith("track share")).length, 1);
  });

  it("on the web: share-files, then open on a lost tap, never on Cancel", async () => {
    const log: Log = [];
    fakePage(log, { canShareFiles: true, ios: false });
    await shareImage(input(), web);
    assert.equal(log[0], "web-share slabhold-collection.png My collection on Slabhold");
    assert.equal(log.filter((line) => line.startsWith("track share")).length, 1);

    const lost: Log = [];
    fakePage(lost, { canShareFiles: true, ios: false, share: () => Promise.reject(new DOMException("no gesture", "NotAllowedError")) });
    await shareImage(input(), web);
    assert.deepEqual(lost, ["web-share slabhold-collection.png My collection on Slabhold", "open /api/share/collection.png"]);

    const cancel: Log = [];
    fakePage(cancel, { canShareFiles: true, ios: false, share: () => Promise.reject(new DOMException("cancel", "AbortError")) });
    await shareImage(input(), web);
    assert.deepEqual(cancel, ["web-share slabhold-collection.png My collection on Slabhold"]);
  });

  it("on the web: an iPhone without file sharing opens the image", async () => {
    const log: Log = [];
    fakePage(log, { canShareFiles: false, ios: true });
    await shareImage(input(), web);
    assert.deepEqual(log, ["open /api/share/collection.png"]);
  });

  it("on the web: everywhere else downloads it", async () => {
    const log: Log = [];
    fakePage(log, { canShareFiles: false, ios: false });
    await shareImage(input(), web);
    assert.equal(log[0], "download slabhold-collection.png");
    assert.equal(log.filter((line) => line.startsWith("track share")).length, 1);
  });
});
