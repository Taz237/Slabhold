import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, createElement } from "react";
import { installDom } from "@/lib/test/dom";
import { logoutHomePending, markLogoutHome } from "@/lib/auth/logout-home";
import { installPromptReady, resetInstallPrompt } from "@/lib/pwa/install-prompt";

const { win } = installDom();

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

let unmount: (() => void) | null = null;
afterEach(() => {
  unmount?.();
  unmount = null;
  resetInstallPrompt();
});

async function renderListeners() {
  const { createRoot } = await import("react-dom/client");
  const { WelcomeListeners } = await import("@/components/landing/welcome-listeners");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(WelcomeListeners));
  });
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

describe("signed-out Home listeners", () => {
  it("holds Chrome's install prompt, since /welcome has no AppShell", async () => {
    const host = await renderListeners();
    assert.equal(host.innerHTML, "");
    const event = new win.Event("beforeinstallprompt", { cancelable: true });
    win.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(installPromptReady(), true);
  });

  it("clears the logout-home flag once the visitor is on /", async () => {
    markLogoutHome();
    assert.equal(logoutHomePending(), true);
    await renderListeners();
    assert.equal(logoutHomePending(), false);
  });

  it("is rendered by app/welcome/page.tsx", () => {
    const page = read("app/welcome/page.tsx");
    assert.match(page, /import \{ WelcomeListeners \} from "@\/components\/landing\/welcome-listeners";/);
    assert.match(page, /<WelcomeListeners \/>/);
  });
});
