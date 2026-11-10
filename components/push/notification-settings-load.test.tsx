import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";
import type { SocialContextValue } from "@/components/social-provider";

const { win } = installDom();

// The real browser client, pointed at a fixture project. Its requests to
// `notification_prefs` land in this fake fetch; each test sets what a read does.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-key";
// No cross-tab channel: an open one would keep the test process alive.
const originalBroadcastChannel = globalThis.BroadcastChannel;
Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, writable: true, value: undefined });

type Read = () => Promise<Response>;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const noRow: Read = async () => json([]);
const rowRead = (row: Record<string, unknown>): Read => async () => json([row]);
const failedRead: Read = async () => json({ message: "permission denied", code: "42501" }, 500);
// Aborted, so supabase-js gives up at once instead of retrying with backoff.
const thrownRead: Read = async () => Promise.reject(new DOMException("The request was cut off.", "AbortError"));

let nextRead: Read = noRow;
let reads = 0;
const upserts: Record<string, unknown>[] = [];

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  assert.equal(url.host, "fixture.supabase.test", "nothing leaves the fixture project");
  assert.equal(url.pathname, "/rest/v1/notification_prefs");
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method === "GET") {
    reads++;
    return nextRead();
  }
  assert.equal(method, "POST");
  const body = JSON.parse(String(init?.body)) as Record<string, unknown> | Record<string, unknown>[];
  upserts.push(...(Array.isArray(body) ? body : [body]));
  return new Response(null, { status: 201 });
}) as typeof fetch;
after(async () => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, writable: true, value: originalBroadcastChannel });
  // The browser client's auth refresh timer would keep the test process alive.
  const { loadedSupabaseBrowser } = await import("@/lib/supabase/browser-lazy");
  await loadedSupabaseBrowser()?.auth.stopAutoRefresh();
});

async function waitFor(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  assert.ok(check());
}

async function mount() {
  const { SocialContext } = await import("@/components/social-provider");
  const { NotificationSettings } = await import("@/components/push/notification-settings");
  const { createRoot } = await import("react-dom/client");
  const social = { user: { id: "user-1" }, ready: true, mode: "supabase" } as unknown as SocialContextValue;
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        SocialContext.Provider,
        { value: social },
        // The device slot keeps this about prefs, not this browser's push support.
        createElement(NotificationSettings as (props: { deviceSection?: ReactNode }) => ReactNode, { deviceSection: createElement("div", null, "device") }),
      ),
    );
  });
  return {
    host,
    switches: () => [...host.querySelectorAll<HTMLButtonElement>('[role="switch"]')],
    button: (name: string) => [...host.querySelectorAll("button")].find((button) => button.textContent === name),
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function reset(read: Read) {
  nextRead = read;
  reads = 0;
  upserts.length = 0;
}

async function click(element: Element | undefined) {
  assert.ok(element);
  await act(async () => {
    element.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  });
}

describe("Settings > Notifications when the prefs read fails", () => {
  // First, while the client cannot load yet (the lazy client keeps one once it has).
  it("shows Retry and never saves defaults when there is no client", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    reset(noRow);
    const view = await mount();
    try {
      await waitFor(() => Boolean(view.button("Retry")));
      assert.equal(reads, 0);
      assert.equal(view.switches().length, 0);
      assert.equal(upserts.length, 0);
    } finally {
      view.unmount();
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    }
  });

  for (const [name, read] of [
    ["the query returns an error", failedRead],
    ["the request is cut off", thrownRead],
  ] as const) {
    it(`shows Retry, no toggles, and never saves defaults when ${name}`, async () => {
      reset(read);
      const view = await mount();
      await waitFor(() => Boolean(view.button("Retry")));
      assert.ok(reads > 0, "the read was tried");
      assert.match(view.host.textContent ?? "", /Something went wrong\. Try again\./);
      assert.equal(view.switches().length, 0, "no pref or quiet-hours switch to tap");
      assert.equal(view.host.querySelectorAll('input[type="time"]').length, 0);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      assert.equal(upserts.length, 0);
      view.unmount();
    });
  }

  it("Retry reads again and shows the real row once it loads", async () => {
    reset(failedRead);
    const view = await mount();
    await waitFor(() => Boolean(view.button("Retry")));
    const readsBefore = reads;
    nextRead = rowRead({ user_id: "user-1", push_like: false, quiet_enabled: true });
    await click(view.button("Retry"));
    await waitFor(() => view.switches().length > 0);
    assert.ok(reads > readsBefore);
    assert.equal(view.button("Retry"), undefined);
    const likes = view.switches().find((item) => item.textContent?.includes("Likes"));
    assert.equal(likes?.getAttribute("aria-checked"), "false");
    assert.equal(upserts.length, 0);
    view.unmount();
  });
});

describe("Settings > Notifications when the prefs read works", () => {
  it("a confirmed missing row shows defaults and may save them", async () => {
    reset(noRow);
    const view = await mount();
    await waitFor(() => view.switches().length > 0);
    assert.ok(view.switches().every((item) => !item.disabled));
    const followers = view.switches().find((item) => item.textContent?.includes("New followers"));
    assert.equal(followers?.getAttribute("aria-checked"), "true");
    await click(followers);
    await waitFor(() => upserts.length === 1);
    assert.equal(upserts[0].user_id, "user-1");
    assert.equal(upserts[0].push_follow, false);
    assert.equal(upserts[0].push_like, true);
    view.unmount();
  });

  it("a real row is what's shown and what's saved", async () => {
    reset(
      rowRead({
        user_id: "user-1",
        push_like: false,
        push_dm: false,
        show_previews: false,
        quiet_enabled: true,
        quiet_start: "23:30:00",
        quiet_end: "07:15:00",
      }),
    );
    const view = await mount();
    await waitFor(() => view.switches().length > 0);
    const byLabel = (label: string) => view.switches().find((item) => item.textContent?.includes(label));
    assert.equal(byLabel("Likes")?.getAttribute("aria-checked"), "false");
    assert.equal(byLabel("Direct messages")?.getAttribute("aria-checked"), "false");
    assert.equal(byLabel("Show previews")?.getAttribute("aria-checked"), "false");
    const times = [...view.host.querySelectorAll<HTMLInputElement>('input[type="time"]')].map((input) => input.value);
    assert.deepEqual(times, ["23:30", "07:15"]);
    await click(byLabel("Replies"));
    await waitFor(() => upserts.length === 1);
    const row = upserts[0];
    assert.equal(row.push_reply, false);
    assert.equal(row.push_like, false);
    assert.equal(row.push_dm, false);
    assert.equal(row.show_previews, false);
    assert.equal(row.quiet_enabled, true);
    assert.equal(row.quiet_start, "23:30");
    assert.equal(row.quiet_end, "07:15");
    view.unmount();
  });
});
