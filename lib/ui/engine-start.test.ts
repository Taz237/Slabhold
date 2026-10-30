import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { installDom } from "@/lib/test/dom";
import { engineFirst } from "@/lib/ui/engine-start";

const { win } = installDom();

const KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const saved = KEYS.map((key) => process.env[key]);

describe("engine start", () => {
  before(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key-for-unit-tests";
  });

  after(() => {
    KEYS.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
    win.history.replaceState(null, "", "/");
  });

  it("never loads for a visitor on signed-out Home", () => {
    win.history.replaceState(null, "", "/");
    assert.equal(engineFirst(), false);
    assert.equal(engineFirst("/"), false);
  });

  it("loads with the page when a session cookie says someone is signed in", () => {
    win.history.replaceState(null, "", "/");
    win.document.documentElement.dataset.session = "";
    try {
      assert.equal(engineFirst(), true);
    } finally {
      delete win.document.documentElement.dataset.session;
    }
  });

  it("loads in the installed app, whose Home sends a signed-out reader to log in", () => {
    win.history.replaceState(null, "", "/");
    const nav = win.navigator as Navigator & { standalone?: boolean };
    Object.defineProperty(nav, "standalone", { configurable: true, value: true });
    try {
      assert.equal(engineFirst(), true);
    } finally {
      delete nav.standalone;
    }
  });

  it("loads with local accounts, which keep their session in storage", () => {
    win.history.replaceState(null, "", "/");
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    try {
      assert.equal(engineFirst(), true);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    }
  });

  it("loads on every other page, and once a visitor leaves Home", () => {
    for (const path of ["/collection", "/cards/abc", "/login", "/u/someone"]) {
      win.history.replaceState(null, "", path);
      assert.equal(engineFirst(), true, path);
    }
    win.history.replaceState(null, "", "/");
    assert.equal(engineFirst("/login"), true);
  });
});
