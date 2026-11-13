import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { flushAfterAction } from "./native-client";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

function deps(input: { webPushOn: boolean; apnsOn: boolean | "error" }) {
  let flushes = 0;
  let apnsChecks = 0;
  return {
    value: {
      webPushOn: () => input.webPushOn,
      apnsOn: async () => {
        apnsChecks += 1;
        if (input.apnsOn === "error") throw new Error("offline");
        return input.apnsOn;
      },
      flush: () => {
        flushes += 1;
      },
    },
    flushes: () => flushes,
    apnsChecks: () => apnsChecks,
  };
}

describe("sending the pushes a like, reply, follow or DM caused", () => {
  it("flushes from the website when only the iPhone app's push is on (no web push keys)", async () => {
    const d = deps({ webPushOn: false, apnsOn: true });
    assert.equal(await flushAfterAction(d.value), true);
    assert.equal(d.flushes(), 1);
  });

  it("flushes with web push on, without asking about APNs", async () => {
    const d = deps({ webPushOn: true, apnsOn: false });
    assert.equal(await flushAfterAction(d.value), true);
    assert.equal(d.flushes(), 1);
    assert.equal(d.apnsChecks(), 0);
  });

  it("stays quiet when both are off, or the check fails", async () => {
    const off = deps({ webPushOn: false, apnsOn: false });
    assert.equal(await flushAfterAction(off.value), false);
    assert.equal(off.flushes(), 0);
    const broken = deps({ webPushOn: false, apnsOn: "error" });
    assert.equal(await flushAfterAction(broken.value), false);
    assert.equal(broken.flushes(), 0);
  });
});

describe("push flush wiring", () => {
  it("mounts the web manager for every signed-in web visitor, not only when web push keys are set", () => {
    const shell = read("components/app-shell.tsx");
    assert.match(shell, /\{user \? <PushAfterIdle key=\{user\.id\} user=\{user\} \/> : null\}/);
    assert.doesNotMatch(shell, /NEXT_PUBLIC_VAPID_PUBLIC_KEY \?/);
  });

  it("flushes after every action on the website and in the app, before any web-push-only check", () => {
    const web = read("components/push/push-manager.tsx");
    const listener = web.slice(web.indexOf("onSocialAction((action) => {"));
    assert.match(listener, /^onSocialAction\(\(action\) => \{\s+void flushAfterAction\(\);\s+if \(!featureOn \|\| !ASK_ACTIONS\.has\(action\)\) return;/);
    assert.doesNotMatch(web, /firePushFlush/);
    const app = read("components/native/native-push-manager.tsx");
    assert.match(app, /onSocialAction\(\(action\) => \{\s+void flushAfterAction\(\);/);
  });

  it("saves this iPhone's token again when the app comes back, and before a Settings test", () => {
    const app = read("components/native/native-push-manager.tsx");
    assert.match(app, /native\.onAppResume\(/);
    assert.match(app, /RESAVE_EVERY_MS/);
    const settings = read("components/native/native-notification-settings.tsx");
    const test = settings.slice(settings.indexOf("const sendTest = "), settings.indexOf("return (", settings.indexOf("const sendTest = ")));
    assert.ok(test.indexOf("saveApnsToken(token)") >= 0);
    assert.ok(test.indexOf("saveApnsToken(token)") < test.indexOf("sendTestPush()"));
  });
});
