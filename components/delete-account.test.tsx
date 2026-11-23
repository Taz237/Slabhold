import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { SocialContext } from "@/components/social-provider";
import { DELETE_RESUME_PATH } from "@/lib/account/apple-delete-flow";
import { APPLE_FINISH_COPY } from "@/lib/account/apple-sign-in";

after(() => new Promise((resolve) => setTimeout(resolve, 1500)));
const { win } = installDom();

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

type Call = { url: string; init: RequestInit | undefined };
let calls: Call[] = [];
let replies: { status: number; body: unknown }[] = [];
let appleStarts: string[] = [];
let appleOk = true;
let signOuts = 0;
let replaced: string[] = [];
let root: Root | null = null;
let host: HTMLElement;

const router = { back() {}, forward() {}, refresh() {}, push() {}, prefetch() {}, replace: (to: string) => void replaced.push(to) };

beforeEach(async () => {
  const { createRoot } = await import("react-dom/client");
  calls = [];
  replies = [];
  appleStarts = [];
  appleOk = true;
  signOuts = 0;
  replaced = [];
  win.history.replaceState(null, "", "/settings/privacy");
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { fetch?: unknown }).fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const reply = replies.shift() ?? { status: 200, body: { ok: true } };
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
  };
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
});

async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
}

async function mount() {
  const { DeleteAccount } = await import("@/components/delete-account");
  const social = { signOut: async () => void (signOuts += 1) } as never;
  await act(async () =>
    root!.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(
          SocialContext.Provider,
          { value: social },
          createElement(DeleteAccount, {
            startApple: async (next: string) => {
              appleStarts.push(next);
              return appleOk;
            },
          }),
        ),
      ),
    ),
  );
  await settle();
}

function button(name: RegExp) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].filter((node) => name.test(node.textContent ?? "")).at(-1);
  assert.ok(found, `button ${name}`);
  return found;
}

async function click(target: HTMLElement) {
  await act(async () => target.click());
  await settle();
}

async function typeDelete() {
  await click(button(/^Delete account$/));
  const input = host.querySelector<HTMLInputElement>("#delete-confirm");
  assert.ok(input);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!;
    setter.call(input, "DELETE");
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
  await click(button(/^Delete$/));
}

const text = () => host.textContent ?? "";

describe("Delete account: Apple login with revoke set up", () => {
  it("asks for Continue with Apple after DELETE, and deletes nothing first", async () => {
    replies = [{ status: 200, body: { needApple: true } }];
    await mount();
    await typeDelete();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/account/delete");
    assert.equal(calls[0].init?.body, undefined, "the typed call sends no body");
    assert.match(text(), /Confirm with Apple/);
    assert.match(text(), /Nothing is deleted until you do\./);
    assert.equal(signOuts, 0);
    assert.deepEqual(replaced, []);
    assert.deepEqual(appleStarts, [], "waits for the tap");

    await click(button(/Continue with Apple/));
    assert.deepEqual(appleStarts, [DELETE_RESUME_PATH]);
    assert.equal(calls.length, 1, "still nothing deleted");
    assert.equal(signOuts, 0);
  });

  it("Cancel on the Apple step keeps the account", async () => {
    replies = [{ status: 200, body: { needApple: true } }];
    await mount();
    await typeDelete();
    await click(button(/^Cancel$/));
    assert.equal(host.querySelector("[role=dialog]"), null);
    assert.equal(calls.length, 1);
    assert.equal(signOuts, 0);
    assert.deepEqual(appleStarts, []);
  });

  it("says so when Apple can't be opened, and stays put", async () => {
    replies = [{ status: 200, body: { needApple: true } }];
    appleOk = false;
    await mount();
    await typeDelete();
    await click(button(/Continue with Apple/));
    assert.match(host.querySelector("[role=alert]")?.textContent ?? "", /Your account is not deleted/);
    assert.equal(button(/Continue with Apple/).disabled, false);
    assert.equal(signOuts, 0);
  });
});

describe("Delete account: back from Continue with Apple", () => {
  it("posts the delete by itself, without DELETE typed again, and skips the Settings steps when revoked", async () => {
    win.history.replaceState(null, "", DELETE_RESUME_PATH);
    replies = [{ status: 200, body: { ok: true } }];
    await mount();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { resume: true });
    assert.equal(win.location.search, "", "the query is dropped so a reload can't repeat it");
    assert.doesNotMatch(text(), new RegExp(APPLE_FINISH_COPY.title));
    assert.equal(signOuts, 1);
    assert.deepEqual(replaced, ["/?notice=account-deleted"]);
  });

  it("still shows the Settings steps when the revoke didn't succeed", async () => {
    win.history.replaceState(null, "", DELETE_RESUME_PATH);
    replies = [{ status: 200, body: { ok: true, apple: true } }];
    await mount();
    assert.match(text(), new RegExp(APPLE_FINISH_COPY.title));
    assert.match(text(), /Stop Using/);
    assert.equal(signOuts, 0, "signs out after Done");
    await click(button(/^Done$/));
    assert.equal(signOuts, 1);
  });

  it("a refused resume shows the error and the DELETE form, and never loops into Apple", async () => {
    win.history.replaceState(null, "", DELETE_RESUME_PATH);
    replies = [{ status: 409, body: { error: "Apple sign-in didn't finish, so your account is not deleted. Type DELETE to try again." } }];
    await mount();
    assert.equal(calls.length, 1);
    assert.match(text(), /your account is not deleted/);
    assert.ok(host.querySelector("#delete-confirm"));
    assert.deepEqual(appleStarts, []);
    assert.equal(signOuts, 0);
  });

  it("does nothing by itself on the plain page", async () => {
    await mount();
    assert.equal(calls.length, 0);
    assert.equal(host.querySelector("[role=dialog]"), null);
  });
});

describe("Delete account: revoke off or not Apple (unchanged)", () => {
  it("an Apple login deletes at once and shows the Settings steps", async () => {
    replies = [{ status: 200, body: { ok: true, apple: true } }];
    await mount();
    await typeDelete();
    assert.equal(calls.length, 1);
    assert.match(text(), new RegExp(APPLE_FINISH_COPY.title));
    assert.deepEqual(appleStarts, []);
  });

  it("any other login deletes at once and leaves", async () => {
    await mount();
    await typeDelete();
    assert.equal(calls.length, 1);
    assert.equal(signOuts, 1);
    assert.deepEqual(replaced, ["/?notice=account-deleted"]);
  });
});
