import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, describe, it } from "node:test";
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

type SignUpCall = { email: string; password: string; username: string; displayName: string; captchaToken?: string };

function social(calls: SignUpCall[], result: { error?: string; notice?: string } = { notice: "check" }) {
  return {
    ready: true,
    user: null,
    mode: "local" as const,
    signIn: async () => ({}),
    signUp: async (input: SignUpCall) => {
      calls.push(input);
      return result;
    },
  };
}

async function mount(
  calls: SignUpCall[],
  result?: { error?: string; notice?: string },
  { mode = "signup", search = "" }: { mode?: "login" | "signup"; search?: string } = {},
) {
  const { SocialContext } = await import("@/components/social-provider");
  const { AuthForm } = await import("@/components/auth-form");
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
          { value: `/${mode}` },
          createElement(
            SearchParamsContext.Provider,
            { value: new URLSearchParams(search) },
            createElement(
              SocialContext.Provider,
              { value: social(calls, result) as never },
              createElement(AuthForm, { mode }),
            ),
          ),
        ),
      ),
    );
  });
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
});

function heading() {
  return win.document.querySelector("h1")?.textContent ?? "";
}

function input(): HTMLInputElement {
  const field = win.document.querySelector<HTMLInputElement>('form input:not([readonly])');
  assert.ok(field, "step input");
  return field;
}

async function type(value: string) {
  const field = input();
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(field, value);
    field.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
}

/** Enter in the field: implicit form submission. */
async function pressEnter() {
  const form = win.document.querySelector<HTMLFormElement>("form#signup-step");
  assert.ok(form);
  await act(async () => {
    form.requestSubmit();
  });
}

async function click(name: string) {
  const button = [...win.document.querySelectorAll<HTMLElement>("button, a")].find(
    (node) => node.getAttribute("aria-label") === name || node.textContent?.trim() === name,
  );
  assert.ok(button, `button ${name}`);
  await act(async () => {
    button.click();
  });
}

/**
 * Polls until the page shows `text`. The username check is a debounce plus an
 * async lookup, so a fixed sleep flakes on a slow runner.
 */
async function waitForText(text: RegExp, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!text.test(win.document.body.textContent ?? "")) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${text}: ${win.document.body.textContent?.slice(0, 400)}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

function progress() {
  return win.document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuetext");
}

describe("sign-up flow", () => {
  it("asks one thing per screen, with progress, Enter to continue and Back", async () => {
    const calls: SignUpCall[] = [];
    const view = await mount(calls);
    cleanup = view.unmount;

    assert.equal(heading(), "What's your email?");
    assert.equal(progress(), "Step 1 of 4");
    assert.equal(input().type, "email");
    assert.equal(input().autocomplete, "email");

    await pressEnter();
    assert.equal(heading(), "What's your email?", "a blank email can't continue");
    assert.match(view.host.textContent ?? "", /Enter a valid email\./);

    await type("ada@example.com");
    await pressEnter();
    assert.equal(heading(), "Make a password");
    assert.equal(progress(), "Step 2 of 4");
    assert.equal(input().autocomplete, "new-password");
    assert.equal(input().type, "password");

    await type("secret12");
    await click("Show password");
    assert.equal(input().type, "text");
    assert.match(view.host.textContent ?? "", /Good\./);

    await click("Back");
    assert.equal(heading(), "What's your email?");
    assert.equal(input().value, "ada@example.com", "going back keeps what they typed");

    await pressEnter();
    await pressEnter();
    assert.equal(heading(), "Pick a username");
    assert.equal(progress(), "Step 3 of 4");
    assert.equal(input().autocomplete, "username");
  });

  it("checks the username live against existing accounts and suggests one when it's taken", async () => {
    const calls: SignUpCall[] = [];
    const view = await mount(calls);
    cleanup = view.unmount;
    await type("ada@example.com");
    await pressEnter();
    await type("secret12");
    await pressEnter();

    await type("WaxRoom");
    assert.match(view.host.textContent ?? "", /Checking…/);
    await waitForText(/That username is taken\./);
    await pressEnter();
    assert.equal(heading(), "Pick a username", "a taken name can't continue");

    await click("Try @waxroom_cards");
    assert.equal(input().value, "waxroom_cards");
    await waitForText(/@waxroom_cards is available/);

    await pressEnter();
    assert.equal(heading(), "What should we call you?");
    assert.equal(input().value, "waxroom_cards", "display name starts as the username");
    assert.equal(input().autocomplete, "name");
  });

  it("creates the account from the last step and shows Check your email", async () => {
    const calls: SignUpCall[] = [];
    const view = await mount(calls);
    cleanup = view.unmount;
    await type("ada@example.com");
    await pressEnter();
    await type("secret12");
    await pressEnter();
    await type("wax_room");
    await waitForText(/@wax_room is available/);
    await pressEnter();
    await type("Ada");
    await pressEnter();

    assert.equal(calls.length, 1);
    assert.deepEqual(
      { ...calls[0], next: undefined },
      { email: "ada@example.com", password: "secret12", username: "wax_room", displayName: "Ada", next: undefined, captchaToken: undefined },
    );
    assert.equal(heading(), "Check your email");
    assert.match(view.host.textContent ?? "", /ada@example\.com/);
    assert.match(view.host.textContent ?? "", /Resend email in \d+s/);

    await click("Wrong email? Change it");
    assert.equal(heading(), "What's your email?");
    assert.equal(input().value, "ada@example.com");
  });

  it("jumps back to the username step when the server says it's taken", async () => {
    const calls: SignUpCall[] = [];
    const view = await mount(calls, { error: "That username is taken." });
    cleanup = view.unmount;
    await type("ada@example.com");
    await pressEnter();
    await type("secret12");
    await pressEnter();
    await type("wax_room");
    await waitForText(/@wax_room is available/);
    await pressEnter();
    await pressEnter();
    assert.equal(calls.length, 1);
    assert.equal(heading(), "Pick a username");
    assert.match(view.host.textContent ?? "", /That username is taken\./);
  });

  it("still needs the captcha before creating the account", async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
    const calls: SignUpCall[] = [];
    const view = await mount(calls);
    cleanup = view.unmount;
    await type("ada@example.com");
    await pressEnter();
    await type("secret12");
    await pressEnter();
    await type("wax_room");
    await waitForText(/@wax_room is available/);
    await pressEnter();
    assert.equal(heading(), "What should we call you?");

    const create = [...win.document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Create account",
    );
    assert.ok(create);
    assert.equal(create.disabled, true, "Create account waits for a Turnstile token");
    await pressEnter();
    assert.equal(calls.length, 0, "Enter can't skip the check either");
    assert.match(view.host.textContent ?? "", /Running a quick security check…/);
  });
});

describe("login copy", () => {
  const SETUP = "Log in once to finish setup. You'll pick up right where you left off.";
  const NORMAL = "Log in to your collection, your feed and your DMs.";

  function lead() {
    return win.document.querySelector("h1 + p")?.textContent ?? "";
  }

  function standalone(on: boolean) {
    Object.defineProperty(win.navigator, "standalone", { configurable: true, value: on });
  }

  afterEach(() => {
    standalone(false);
    win.document.cookie = "slabhold_email_hint=; Max-Age=0; Path=/";
  });

  it("says finish setup in the installed app while the email hint is there", async () => {
    standalone(true);
    win.document.cookie = "slabhold_email_hint=ada%40example.com; Path=/";
    const view = await mount([], undefined, { mode: "login", search: "next=%2F&app=1" });
    cleanup = view.unmount;
    assert.equal(heading(), "Welcome back");
    assert.equal(lead(), SETUP);
    assert.equal(win.document.querySelector<HTMLInputElement>('input[type="email"]')?.value, "ada@example.com");
  });

  it("is the normal copy in the installed app with no hint, like after logging out", async () => {
    standalone(true);
    const view = await mount([], undefined, { mode: "login", search: "next=%2F&app=1" });
    cleanup = view.unmount;
    assert.equal(lead(), NORMAL);
  });

  it("is the normal copy in a browser, even with app=1 or a hint", async () => {
    win.document.cookie = "slabhold_email_hint=ada%40example.com; Path=/";
    let view = await mount([], undefined, { mode: "login", search: "next=%2F" });
    assert.equal(lead(), NORMAL);
    view.unmount();
    view = await mount([], undefined, { mode: "login", search: "next=%2F&app=1" });
    cleanup = view.unmount;
    assert.equal(lead(), NORMAL);
  });
});
