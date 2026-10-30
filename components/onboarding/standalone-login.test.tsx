import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";

const { win } = installDom();
for (const name of ["HTMLInputElement", "MutationObserver"] as const) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: win[name] });
}

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const { PathnameContext, SearchParamsContext } = require(
  "next/dist/shared/lib/hooks-client-context.shared-runtime",
) as {
  PathnameContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const JSDOM_UA = win.navigator.userAgent;

function device(userAgent: string, standalone: boolean) {
  Object.defineProperty(win.navigator, "userAgent", { configurable: true, get: () => userAgent });
  Object.defineProperty(win.navigator, "standalone", { configurable: true, get: () => standalone });
}

const pushed: string[] = [];
const replaced: string[] = [];
const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push(href: string) {
    pushed.push(href);
  },
  replace(href: string) {
    replaced.push(href);
  },
  prefetch() {},
};

const signIns: { email: string; password: string }[] = [];

function social() {
  return {
    ready: true,
    user: null,
    mode: "local" as const,
    signIn: async (email: string, password: string) => {
      signIns.push({ email, password });
      return {};
    },
    signUp: async () => ({}),
  };
}

let cleanup: (() => void) | null = null;

async function mount(node: ReactNode, options: { pathname: string; search?: string }) {
  const { SocialContext } = await import("@/components/social-provider");
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(
          PathnameContext.Provider,
          { value: options.pathname },
          createElement(
            SearchParamsContext.Provider,
            { value: new URLSearchParams(options.search ?? "") },
            createElement(SocialContext.Provider, { value: social() as never }, node),
          ),
        ),
      ),
    );
  });
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

beforeEach(() => {
  pushed.length = 0;
  replaced.length = 0;
  signIns.length = 0;
  win.document.cookie = "slabhold_email_hint=; Max-Age=0; Path=/";
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  device(JSDOM_UA, false);
});

describe("installed app, signed out", () => {
  it("goes to a log-in-once screen instead of the landing page", async () => {
    device(IPHONE_SAFARI, true);
    const { StandaloneLoginGate } = await import("@/components/onboarding/standalone-login");
    const host = await mount(
      createElement(StandaloneLoginGate, null, createElement("p", { id: "landing" }, "Landing")),
      { pathname: "/" },
    );
    assert.deepEqual(replaced, ["/login?next=%2F&app=1"]);
    assert.equal(host.querySelector("#landing"), null, "no landing flash");
  });

  it("leaves Safari and other pages alone", async () => {
    device(IPHONE_SAFARI, false);
    const { StandaloneLoginGate } = await import("@/components/onboarding/standalone-login");
    const host = await mount(
      createElement(StandaloneLoginGate, null, createElement("p", { id: "landing" }, "Landing")),
      { pathname: "/" },
    );
    assert.deepEqual(replaced, []);
    assert.ok(host.querySelector("#landing"));
  });

  it("prefills the email, says why, and picks setup back up after login", async () => {
    device(IPHONE_SAFARI, true);
    win.document.cookie = "slabhold_email_hint=ada%40example.com; Path=/";
    const { AuthForm } = await import("@/components/auth-form");
    const host = await mount(createElement(AuthForm, { mode: "login" }), {
      pathname: "/login",
      search: "next=%2F&app=1",
    });
    assert.equal(host.querySelector("h1")?.textContent, "Welcome back");
    assert.match(host.textContent ?? "", /Log in once to finish setup/);
    const email = host.querySelector<HTMLInputElement>('input[type="email"]');
    assert.equal(email?.value, "ada@example.com");
    const password = host.querySelector<HTMLInputElement>('input[autocomplete="current-password"]');
    assert.ok(password);
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(password, "secret12");
      password.dispatchEvent(new win.Event("input", { bubbles: true }));
    });
    const form = host.querySelector<HTMLFormElement>("form");
    assert.ok(form);
    await act(async () => {
      form.requestSubmit();
    });
    assert.deepEqual(signIns, [{ email: "ada@example.com", password: "secret12" }]);
    assert.deepEqual(pushed, ["/"], "Home, where setup and the tour carry on");
    assert.doesNotMatch(win.document.cookie, /slabhold_email_hint=ada/, "the hint is cleared");
  });

  it("keeps the usual login copy outside the installed app", async () => {
    const { AuthForm } = await import("@/components/auth-form");
    const host = await mount(createElement(AuthForm, { mode: "login" }), { pathname: "/login" });
    assert.doesNotMatch(host.textContent ?? "", /finish setup/);
    assert.equal(host.querySelector<HTMLInputElement>('input[type="email"]')?.value, "");
  });

  it("wraps the landing page, and the shell listens for Chrome's prompt", () => {
    const gate = readFileSync(join(process.cwd(), "components/home-gate.tsx"), "utf8");
    const shell = readFileSync(join(process.cwd(), "components/app-shell.tsx"), "utf8");
    assert.match(gate, /<StandaloneLoginGate>\s*\{landing\}\s*<\/StandaloneLoginGate>/);
    assert.match(shell, /listenForInstallPrompt\(\)/);
  });
});
