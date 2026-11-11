import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLIENT_REPORT_CAP, createClientReporter } from "@/lib/errors/client";

function fakeWindow() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    location: { pathname: "/cards/3f2b1c9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f", href: "" },
    addEventListener(type: string, fn: (event: unknown) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (event: unknown) => void) {
      listeners.get(type)?.delete(fn);
    },
    fire(type: string, event: unknown) {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
    count(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function setup() {
  const sent: Record<string, unknown>[] = [];
  const win = fakeWindow();
  const reporter = createClientReporter({
    send: (body) => void sent.push(JSON.parse(body) as Record<string, unknown>),
    platform: () => "web",
    version: "abc1234",
    win: win as never,
  });
  return { sent, win, reporter };
}

describe("client error reporter", () => {
  it("reports window errors with route, version and platform", () => {
    const { sent, win, reporter } = setup();
    const stop = reporter.install();
    win.fire("error", { message: "boom", error: new Error("boom") });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].kind, "error");
    assert.equal(sent[0].message, "boom");
    assert.equal(sent[0].route, "/cards/:id");
    assert.equal(sent[0].version, "abc1234");
    assert.equal(sent[0].platform, "web");
    assert.ok(String(sent[0].stack).includes("boom"));
    stop();
    assert.equal(win.count("error"), 0);
    assert.equal(win.count("unhandledrejection"), 0);
  });

  it("reports unhandled rejections, including non-Error reasons", () => {
    const { sent, win, reporter } = setup();
    reporter.install();
    win.fire("unhandledrejection", { reason: new TypeError("Load failed") });
    win.fire("unhandledrejection", { reason: "plain reason" });
    assert.equal(sent.length, 2);
    assert.equal(sent[0].kind, "unhandledrejection");
    assert.equal(sent[0].message, "TypeError: Load failed");
    assert.equal(sent[1].message, "plain reason");
  });

  it("reports boundary errors with the Next digest", () => {
    const { sent, reporter } = setup();
    reporter.report(Object.assign(new Error("render"), { digest: "998877" }), "boundary");
    assert.equal(sent[0].kind, "boundary");
    assert.equal(sent[0].digest, "998877");
  });

  it("never sends emails or tokens", () => {
    const { sent, reporter } = setup();
    reporter.report(new Error("no account for sam@example.com token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlc2ln"), "error");
    const body = JSON.stringify(sent[0]);
    assert.doesNotMatch(body, /example\.com/);
    assert.doesNotMatch(body, /eyJhbGci/);
  });

  it("sends the same error once and stops after the cap", () => {
    const { sent, reporter } = setup();
    reporter.report(new Error("same"), "error");
    reporter.report(new Error("same"), "error");
    assert.equal(sent.length, 1);
    for (let i = 0; i < CLIENT_REPORT_CAP + 5; i += 1) reporter.report(new Error(`e${i}`), "error");
    assert.equal(sent.length, CLIENT_REPORT_CAP);
  });

  it("never throws when sending fails", () => {
    const win = fakeWindow();
    const reporter = createClientReporter({
      send: () => {
        throw new Error("offline");
      },
      platform: () => "ios",
      version: "v",
      win: win as never,
    });
    assert.doesNotThrow(() => reporter.report(new Error("x"), "error"));
  });
});
