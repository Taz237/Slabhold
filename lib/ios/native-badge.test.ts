import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { clearNativeBadge, keepNativeBadge, type BadgeEnv, type BadgeNative } from "@/components/native/native-push-manager";

const root = join(import.meta.dirname, "..", "..");

function fakeNative(available: boolean) {
  const calls: number[] = [];
  let resume: (() => void) | null = null;
  let resumeStops = 0;
  const native: BadgeNative = {
    nativeExtrasAvailable: () => available,
    setNativeBadge: async (count) => {
      calls.push(count);
    },
    onAppResume: (listener) => {
      resume = listener;
      return () => {
        resumeStops += 1;
        resume = null;
      };
    },
  };
  return { native, calls, resume: () => resume?.(), resumeStops: () => resumeStops };
}

function fakeEnv() {
  const doc = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  doc.visibilityState = "visible";
  const win = new EventTarget();
  const env: BadgeEnv = { document: doc, window: win };
  return { env, doc, win };
}

describe("app icon badge in the iPhone app", () => {
  it("sets the badge to unread at once, and again when the app is back in front", () => {
    const { native, calls, resume } = fakeNative(true);
    const { env, doc, win } = fakeEnv();
    const stop = keepNativeBadge(native, 4, env);
    assert.deepEqual(calls, [4]);
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    assert.deepEqual(calls, [4], "not while hidden");
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("focus"));
    resume();
    assert.deepEqual(calls, [4, 4, 4, 4]);
    stop();
    doc.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("focus"));
    assert.deepEqual(calls, [4, 4, 4, 4], "listeners removed");
  });

  it("clears to 0 once everything is read, and on sign-out", async () => {
    const { native, calls } = fakeNative(true);
    keepNativeBadge(native, 0, fakeEnv().env)();
    await clearNativeBadge(native);
    assert.deepEqual(calls, [0, 0]);
  });

  it("makes no calls and doesn't throw on builds without the plugin", async () => {
    const { native, calls, resumeStops } = fakeNative(false);
    const { env, doc } = fakeEnv();
    const stop = keepNativeBadge(native, 7, env);
    doc.dispatchEvent(new Event("visibilitychange"));
    stop();
    await clearNativeBadge(native);
    assert.deepEqual(calls, []);
    assert.equal(resumeStops(), 0, "no resume listener either");
  });

  it("doesn't throw when the plugin call fails", async () => {
    const native: BadgeNative = {
      nativeExtrasAvailable: () => true,
      setNativeBadge: () => Promise.reject(new Error("UNIMPLEMENTED")),
      onAppResume: () => () => {},
    };
    keepNativeBadge(native, 2, fakeEnv().env)();
    await clearNativeBadge(native);
  });

  it("counts unread notifications plus unread DMs, keeps the sign-out hook, and clears on unmount", () => {
    const manager = readFileSync(join(root, "components/native/native-push-manager.tsx"), "utf8");
    assert.match(manager, /const unread = notifications\.filter\(\(note\) => !note\.read\)\.length \+ unreadMessageCount;/);
    assert.match(manager, /stop = keepNativeBadge\(native, unread, \{ document, window \}\)/);
    assert.match(manager, /\}, \[unread\]\);/);
    assert.match(manager, /\.then\(\(native\) => clearNativeBadge\(native\)\)/);
    assert.equal((manager.match(/setSignOutHook\(/g) ?? []).length, 2, "the one hook, set and unset");
  });
});
