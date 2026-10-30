import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { FLIGHT_HEADERS } from "next/dist/client/components/app-router-headers";
import { HeadersAdapter } from "next/dist/server/web/spec-extension/adapters/headers";
import { proxy } from "@/proxy";
import { isRouterNavigation, markRouterRequest, ROUTER_NAV_HEADER } from "./router-nav";

/** headers() as a page sees it: Next's sealed view, with its router headers hidden. */
function sealed(headers: Headers) {
  const hidden = new Set(FLIGHT_HEADERS.map((name) => name.toLowerCase()));
  return HeadersAdapter.seal(HeadersAdapter.from(headers), hidden);
}

describe("telling an in-app visit from a full page load", () => {
  it("can't read the router's own header through a page's headers()", () => {
    const view = sealed(new Headers({ rsc: "1", "next-router-state-tree": "x" }));
    assert.equal(view.get("rsc"), null);
    assert.equal(isRouterNavigation(view), false);
  });

  it("reads the proxy's mark through a page's headers()", () => {
    for (const name of ["rsc", "next-router-prefetch", "next-router-segment-prefetch"]) {
      const marked = markRouterRequest(new Headers({ [name]: "1" }));
      assert.ok(marked, name);
      assert.equal(isRouterNavigation(sealed(marked)), true, name);
    }
  });

  it("marks the router's fetch by what Next leaves on it: Sec-Fetch-Mode or Next-Url", () => {
    // Next deletes rsc and the other router headers before the proxy runs.
    assert.ok(markRouterRequest(new Headers({ "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" })));
    assert.ok(markRouterRequest(new Headers({ "sec-fetch-mode": "same-origin" })));
    assert.ok(markRouterRequest(new Headers({ "next-url": "/" })));
  });

  it("leaves a full page load unmarked", () => {
    assert.equal(markRouterRequest(new Headers({ "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" })), null);
    assert.equal(markRouterRequest(new Headers({ accept: "text/html" })), null);
    assert.equal(isRouterNavigation(sealed(new Headers({ accept: "text/html" }))), false);
  });

  it("forwards the mark from the proxy on the seeded routes", async () => {
    for (const path of ["/collection", `/cards/${"0".repeat(8)}-0000-4000-8000-000000000001`]) {
      // As the proxy receives a router fetch: rsc already stripped by Next.
      const nav = await proxy(new NextRequest(`http://localhost${path}`, { headers: { "sec-fetch-mode": "cors", "next-url": "/" } }));
      assert.equal(nav.headers.get(`x-middleware-request-${ROUTER_NAV_HEADER}`), "1", path);
      assert.match(nav.headers.get("x-middleware-override-headers") ?? "", new RegExp(ROUTER_NAV_HEADER));
      const load = await proxy(new NextRequest(`http://localhost${path}`, { headers: { "sec-fetch-mode": "navigate" } }));
      assert.equal(load.headers.get(`x-middleware-request-${ROUTER_NAV_HEADER}`), null, path);
    }
  });
});
