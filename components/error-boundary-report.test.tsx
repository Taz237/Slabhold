import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { act, createElement } from "react";
import { installDom } from "@/lib/test/dom";

const { win } = installDom();

type Call = { url: string; body: Record<string, unknown> };

async function captureReports(run: () => Promise<void>): Promise<Call[]> {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
  return calls;
}

async function render(element: ReturnType<typeof createElement>) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  return () => {
    act(() => root.unmount());
    host.remove();
  };
}

describe("error boundaries report what they caught", () => {
  it("(app)/error.tsx sends a boundary report", async () => {
    const { default: AppError } = await import("@/app/(app)/error");
    const calls = await captureReports(async () => {
      const unmount = await render(
        createElement(AppError, {
          error: Object.assign(new Error("feed exploded"), { digest: "111" }),
          reset() {},
          retry() {},
        }),
      );
      unmount();
    });
    const sent = calls.find((call) => call.body.message === "feed exploded");
    assert.ok(sent, "a report was sent");
    assert.equal(sent.url, "/api/client-error");
    assert.equal(sent.body.kind, "boundary");
    assert.equal(sent.body.digest, "111");
  });

  it("global-error.tsx reports and the root layout installs the listeners", () => {
    const globalError = readFileSync(join(process.cwd(), "app/global-error.tsx"), "utf8");
    assert.match(globalError, /reportClientError\(error, "global-boundary"\)/);
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    assert.match(layout, /<ClientErrorReporter \/>/);
  });
});
