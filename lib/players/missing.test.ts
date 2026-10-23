import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { playerPathIsMissing, playerSlugFromPath } from "./missing";
import type { PlayerRef } from "./slug";

const ROSTER: PlayerRef[] = [
  { name: "CJ Stroud", sport: "Football" },
  { name: "Will Smith", sport: "Baseball" },
  { name: "Will Smith", sport: "Hockey" },
];

function jsonResponse(rows: unknown, ok = true): Response {
  return new Response(JSON.stringify(rows), { status: ok ? 200 : 500 });
}

describe("player path missing", () => {
  it("reads only the player segment", () => {
    assert.equal(playerSlugFromPath("/p/cj-stroud"), "cj-stroud");
    assert.equal(playerSlugFromPath("/p/cj-stroud/opengraph-image"), null);
    assert.equal(playerSlugFromPath("/posts/cj-stroud"), null);
  });

  it("keeps directory players and shared names", async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return jsonResponse([]);
    };
    assert.equal(
      await playerPathIsMissing({
        pathname: "/p/cj-stroud",
        supabaseUrl: "https://example.supabase.co",
        anonKey: "anon",
        players: ROSTER,
        fetchImpl,
      }),
      false,
    );
    assert.equal(
      await playerPathIsMissing({
        pathname: "/p/c.j.-stroud",
        supabaseUrl: "https://example.supabase.co",
        anonKey: "anon",
        players: ROSTER,
        fetchImpl,
      }),
      false,
    );
    assert.equal(
      await playerPathIsMissing({
        pathname: "/p/will-smith",
        supabaseUrl: undefined,
        anonKey: undefined,
        players: ROSTER,
        fetchImpl,
      }),
      false,
    );
    assert.equal(called, false);
  });

  it("404s an unknown slug and keeps a live public name", async () => {
    assert.equal(
      await playerPathIsMissing({
        pathname: "/p/not-a-real-player-zzzz",
        supabaseUrl: undefined,
        anonKey: undefined,
        players: ROSTER,
      }),
      true,
    );
    const calls: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("public_cards")) {
        return jsonResponse([{ player: "Jaxon Smith", sport: "Football" }]);
      }
      return jsonResponse([]);
    };
    assert.equal(
      await playerPathIsMissing({
        pathname: "/p/jaxon-smith",
        supabaseUrl: "https://example.supabase.co",
        anonKey: "anon-key",
        players: ROSTER,
        fetchImpl,
      }),
      false,
    );
    assert.ok(calls.some((url) => url.includes("/rest/v1/public_cards")));
    assert.ok(calls.every((url) => !url.includes("/rest/v1/cards?")));
    assert.equal(
      await playerPathIsMissing({
        pathname: "/p/not-a-real-player-zzzz",
        supabaseUrl: "https://example.supabase.co",
        anonKey: "anon-key",
        players: ROSTER,
        fetchImpl: async () => jsonResponse([]),
      }),
      true,
    );
    assert.equal(
      await playerPathIsMissing({
        pathname: "/p/not-a-real-player-zzzz",
        supabaseUrl: "https://example.supabase.co",
        anonKey: "anon-key",
        players: ROSTER,
        fetchImpl: async () => {
          throw new Error("offline");
        },
      }),
      false,
    );
  });

  it("is on the proxy matcher and does not read private cards", () => {
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    assert.match(proxy, /\/p\/:player/);
    assert.match(proxy, /playerPathIsMissing/);
    assert.doesNotMatch(proxy, /createSupabaseAdmin|service_role|from\("cards"\)/);
  });
});
