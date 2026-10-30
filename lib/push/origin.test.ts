import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crossSiteRejection, isSameOriginRequest } from "./origin";

const URL_ = "https://slabhold-git-branch.vercel.app/api/push/subscribe";

function request(headers: Record<string, string>, method = "POST") {
  return new Request(URL_, { method, headers });
}

describe("push routes: same-origin check", () => {
  it("passes same-origin by Sec-Fetch-Site (the app and the service worker)", () => {
    assert.equal(isSameOriginRequest(request({ "sec-fetch-site": "same-origin" })), true);
    assert.equal(crossSiteRejection(request({ "sec-fetch-site": "same-origin" }, "DELETE")), null);
  });

  it("passes a matching Origin, taken from the request (preview URLs work)", () => {
    assert.equal(isSameOriginRequest(request({ origin: "https://slabhold-git-branch.vercel.app" })), true);
    assert.equal(isSameOriginRequest(request({ origin: "https://slabhold.app" })), false);
  });

  it("rejects a cross-site Origin with 403", async () => {
    const response = crossSiteRejection(request({ origin: "https://evil.example" }));
    assert.equal(response?.status, 403);
    assert.deepEqual(await response?.json(), { error: "Forbidden" });
    // A look-alike prefix is not the same origin.
    assert.equal(isSameOriginRequest(request({ origin: "https://slabhold-git-branch.vercel.app.evil.example" })), false);
  });

  it("rejects Sec-Fetch-Site: cross-site and same-site", () => {
    assert.equal(crossSiteRejection(request({ "sec-fetch-site": "cross-site" }))?.status, 403);
    assert.equal(crossSiteRejection(request({ "sec-fetch-site": "same-site" }))?.status, 403);
    assert.equal(
      crossSiteRejection(request({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }))?.status,
      403,
    );
  });

  it("rejects a cookie request with neither header", () => {
    assert.equal(crossSiteRejection(request({}))?.status, 403);
  });

  it("skips the check for a Bearer token", () => {
    assert.equal(crossSiteRejection(request({ authorization: "Bearer token", origin: "https://evil.example" })), null);
    assert.equal(crossSiteRejection(request({ authorization: "Bearer " }))?.status, 403);
  });
});

describe("push routes: wiring", () => {
  it("checks mutating routes after the dormant answer and before auth", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
    for (const [path, handlers] of [
      ["app/api/push/subscribe/route.ts", ["POST", "DELETE"]],
      ["app/api/push/flush/route.ts", ["POST"]],
      ["app/api/push/test/route.ts", ["POST"]],
    ] as const) {
      const source = read(path);
      for (const name of handlers) {
        const start = source.indexOf(`export async function ${name}(`);
        assert.ok(start >= 0, `${path} ${name}`);
        const body = source.slice(start, source.indexOf("\n}\n", start));
        const dormant = body.search(/UNAVAILABLE|available: false/);
        const check = body.indexOf("crossSiteRejection(request)");
        const auth = body.indexOf("requestUserId(request)");
        assert.ok(dormant >= 0 && check > dormant && auth > check, `${path} ${name}: dormant, then origin, then auth`);
      }
    }
    // GET subscribe and the cron never check Origin.
    const subscribe = read("app/api/push/subscribe/route.ts");
    const get = subscribe.slice(subscribe.indexOf("export async function GET("));
    assert.doesNotMatch(get.slice(0, get.indexOf("\n}\n")), /crossSiteRejection/);
    assert.doesNotMatch(read("app/api/cron/push-sweep/route.ts"), /crossSiteRejection/);
  });
});
