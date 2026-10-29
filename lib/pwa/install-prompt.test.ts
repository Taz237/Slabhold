import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  installPromptReady,
  listenForInstallPrompt,
  promptInstall,
  resetInstallPrompt,
  subscribeInstallPrompt,
} from "./install-prompt";

function fakePromptEvent(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
    prompted: number;
  };
  event.prompted = 0;
  event.prompt = async () => {
    event.prompted += 1;
  };
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe("install prompt", () => {
  let target: EventTarget;

  beforeEach(() => {
    resetInstallPrompt();
    target = new EventTarget();
  });

  it("is unavailable until Chrome offers it", async () => {
    listenForInstallPrompt(target);
    assert.equal(installPromptReady(), false);
    assert.equal(await promptInstall(), "unavailable");
  });

  it("holds the event, tells listeners, and shows the native prompt once", async () => {
    listenForInstallPrompt(target);
    listenForInstallPrompt(target);
    let calls = 0;
    const stop = subscribeInstallPrompt(() => {
      calls += 1;
    });
    const event = fakePromptEvent("accepted");
    target.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true, "keeps Chrome's mini bar away");
    assert.equal(installPromptReady(), true);
    assert.equal(calls, 1);
    assert.equal(await promptInstall(), "accepted");
    assert.equal(event.prompted, 1);
    assert.equal(installPromptReady(), false, "a prompt can only be used once");
    stop();
  });

  it("reports a dismissed prompt", async () => {
    listenForInstallPrompt(target);
    target.dispatchEvent(fakePromptEvent("dismissed"));
    assert.equal(await promptInstall(), "dismissed");
  });

  it("drops the prompt once the app is installed", () => {
    listenForInstallPrompt(target);
    target.dispatchEvent(fakePromptEvent("accepted"));
    target.dispatchEvent(new Event("appinstalled"));
    assert.equal(installPromptReady(), false);
  });
});
