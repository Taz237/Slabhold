import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appLinkPath, routeLink, routeWindowOpen } from "@/lib/ios/links";

const here = "https://slabhold.app/posts/1";

describe("routeLink", () => {
  it("opens other sites in the in-app browser", () => {
    assert.deepEqual(routeLink({ href: "https://x.com/intent/post?text=hi", here, newTab: true }), {
      kind: "browser",
      url: "https://x.com/intent/post?text=hi",
    });
    assert.deepEqual(routeLink({ href: "http://example.com/", here, newTab: false }), {
      kind: "browser",
      url: "http://example.com/",
    });
  });

  it("leaves a same-tab Slabhold link to the router", () => {
    assert.equal(routeLink({ href: "/u/demo", here, newTab: false }), null);
    assert.equal(routeLink({ href: "https://slabhold.app/collection", here, newTab: false }), null);
  });

  it("keeps a new-tab Slabhold link in the app", () => {
    assert.deepEqual(routeLink({ href: "/terms#data", here, newTab: true }), { kind: "app", path: "/terms#data" });
    assert.deepEqual(routeLink({ href: "https://www.slabhold.app/u/demo?tab=cards", here, newTab: false }), {
      kind: "app",
      path: "/u/demo?tab=cards",
    });
  });

  it("leaves mail, phone and broken links to the WebView", () => {
    assert.equal(routeLink({ href: "mailto:slabholdapp@gmail.com", here, newTab: false }), null);
    assert.equal(routeLink({ href: "tel:+15555550100", here, newTab: false }), null);
    assert.equal(routeLink({ href: "javascript:void(0)", here, newTab: false }), null);
    assert.equal(routeLink({ href: "http://[::1", here, newTab: false }), null);
  });

  it("does not treat a look-alike host as Slabhold", () => {
    assert.equal(routeLink({ href: "https://slabhold.app.evil.test/", here, newTab: false })?.kind, "browser");
  });
});

describe("routeWindowOpen", () => {
  it("sends web pages and images to the in-app browser, absolute", () => {
    assert.equal(routeWindowOpen({ url: "/api/share/collection.png", here }), "https://slabhold.app/api/share/collection.png");
    assert.equal(routeWindowOpen({ url: "https://x.com/", here }), "https://x.com/");
  });

  it("ignores blobs, blanks and other schemes", () => {
    assert.equal(routeWindowOpen({ url: "blob:https://slabhold.app/abc", here }), null);
    assert.equal(routeWindowOpen({ url: "mailto:a@b.co", here }), null);
  });
});

describe("appLinkPath", () => {
  it("turns a universal link into the page to show", () => {
    assert.equal(appLinkPath("https://slabhold.app/u/demo/cards/9?ref=share"), "/u/demo/cards/9?ref=share");
    assert.equal(appLinkPath("https://www.slabhold.app/"), "/");
  });

  it("maps the app's slabhold:// scheme to the same pages", () => {
    assert.equal(appLinkPath("slabhold://u/demo"), "/u/demo");
    assert.equal(appLinkPath("slabhold://u/demo/cards/9?ref=share#top"), "/u/demo/cards/9?ref=share#top");
    assert.equal(appLinkPath("slabhold:///u/demo"), "/u/demo");
    assert.equal(appLinkPath("slabhold://posts/"), "/posts");
    assert.equal(appLinkPath("slabhold://"), "/");
  });

  it("ignores other hosts and schemes", () => {
    assert.equal(appLinkPath("https://example.com/u/demo"), null);
    assert.equal(appLinkPath("http://slabhold.app/u/demo"), null);
    assert.equal(appLinkPath("otherapp://u/demo"), null);
  });
});
