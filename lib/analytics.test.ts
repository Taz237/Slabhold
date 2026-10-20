import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { PAGE_PATTERNS, routePattern, sanitizeProps, scrubAnalyticsUrl, trackEvent } from "./analytics";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("sanitizeProps", () => {
  it("keeps the button and campaign tokens and drops identifying values", () => {
    const userId = "550e8400-e29b-41d4-a716-446655440000";
    assert.deepEqual(
      sanitizeProps({
        button: "signup",
        utm_source: "instagram",
        utm_medium: "social",
        utm_campaign: "spring-2026",
        email: "maya@cardflip.app",
        username: "waxroom",
        userId,
        user_id: userId,
        card: "Luka Doncic Silver Prizm",
        playerName: "Luka Doncic",
        note: "just pulled this from a hobby box",
        url: "https://slabhold.vercel.app/signup?next=/cards/new",
        next: "/signup?email=maya@cardflip.app",
      }),
      {
        button: "signup",
        utm_source: "instagram",
        utm_medium: "social",
        utm_campaign: "spring-2026",
      },
    );
  });

  it("drops emails, free text, query strings, user ids, and unknown buttons", () => {
    assert.deepEqual(sanitizeProps({ button: "login" }), { button: "login" });
    assert.deepEqual(sanitizeProps({ button: "Sign up" }), {});
    assert.deepEqual(sanitizeProps({ button: "signup " }), { button: "signup" });
    assert.deepEqual(sanitizeProps({ utm_source: "maya@cardflip.app" }), {});
    assert.deepEqual(sanitizeProps({ utm_source: "just pulled this" }), {});
    assert.deepEqual(sanitizeProps({ utm_campaign: "Luka Doncic" }), {});
    assert.deepEqual(
      sanitizeProps({ utm_source: "https://example.com/path?next=1" }),
      {},
    );
    assert.deepEqual(sanitizeProps({ utm_medium: "/signup?next=/cards" }), {});
    assert.deepEqual(
      sanitizeProps({ utm_campaign: "550e8400-e29b-41d4-a716-446655440000" }),
      {},
    );
    assert.deepEqual(sanitizeProps({ utm_source: "" }), {});
    assert.deepEqual(sanitizeProps({ utm_source: "a".repeat(48) }), {
      utm_source: "a".repeat(48),
    });
    assert.deepEqual(sanitizeProps({ utm_source: "a".repeat(49) }), {});
    assert.deepEqual(sanitizeProps(null), {});
    assert.deepEqual(sanitizeProps("instagram"), {});
    assert.deepEqual(sanitizeProps(["signup"]), {});
  });
});

describe("trackEvent", () => {
  it("sends the sanitized props and skips an empty payload", () => {
    const sent: { name: string; props?: Record<string, string> }[] = [];
    const send = (name: string, props?: Record<string, string>) => {
      sent.push({ name, props });
    };
    trackEvent("landing_cta_clicked", { button: "login", email: "a@b.com" }, send);
    trackEvent("signup_started", undefined, send);
    trackEvent("not a valid name", { button: "signup" }, send);
    assert.deepEqual(sent, [
      { name: "landing_cta_clicked", props: { button: "login" } },
      { name: "signup_started", props: undefined },
    ]);
  });

  it("does not throw when the sender throws or rejects", async () => {
    assert.doesNotThrow(() =>
      trackEvent("card_added", { playerName: "Luka" }, () => {
        throw new Error("analytics down");
      }),
    );
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      assert.doesNotThrow(() => trackEvent("post_created"));
    } finally {
      console.warn = warn;
    }

    let unhandled = false;
    const onUnhandled = () => {
      unhandled = true;
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      trackEvent("share_clicked", null, () => Promise.reject(new Error("nope")));
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    assert.equal(unhandled, false);
  });
});

function scrubbed(url: string) {
  const event = scrubAnalyticsUrl({ type: "pageview", url });
  assert.ok(event);
  return event.url;
}

function pagePatterns(dir: string, segments: string[] = []): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      if (entry.name === "api" || entry.name.startsWith("@")) continue;
      const next =
        entry.name.startsWith("(") && entry.name.endsWith(")")
          ? segments
          : [...segments, entry.name];
      found.push(...pagePatterns(join(dir, entry.name), next));
      continue;
    }
    if (entry.name === "page.tsx") {
      found.push(segments.length === 0 ? "/" : `/${segments.join("/")}`);
    }
  }
  return found;
}

function samplePath(pattern: string): string {
  if (pattern === "/") return "/";
  return pattern
    .split("/")
    .map((part) => (part.startsWith("[") && part.endsWith("]") ? "donnietaz" : part))
    .join("/");
}

describe("scrubAnalyticsUrl", () => {
  it("keeps the page type and the campaign params", () => {
    assert.equal(scrubbed("/messages/donnietaz?x=1"), "/messages/[username]");
    assert.equal(scrubbed("/search?q=wemby"), "/search");
    assert.equal(scrubbed("/?utm_source=x&foo=1"), "/?utm_source=x");
    assert.equal(
      scrubbed("https://slabhold.vercel.app/messages/donnietaz?x=1"),
      "https://slabhold.vercel.app/messages/[username]",
    );
    assert.equal(
      scrubbed("https://slabhold.vercel.app/search?q=wemby"),
      "https://slabhold.vercel.app/search",
    );
    assert.equal(
      scrubbed("https://slabhold.vercel.app/?utm_source=x&foo=1"),
      "https://slabhold.vercel.app/?utm_source=x",
    );
    assert.equal(scrubbed("/cards/new?q=wemby"), "/cards/new");
    assert.equal(
      scrubbed("/posts/abc123?utm_campaign=launch&q=wemby&utm_source=ig"),
      "/posts/[id]?utm_campaign=launch&utm_source=ig",
    );
    assert.equal(scrubbed("/search?q=wemby#luka"), "/search");
    assert.deepEqual(scrubAnalyticsUrl({ type: "event", url: "/u/donnietaz/cards/abc?token=1" }), {
      type: "event",
      url: "/u/[username]/cards/[id]",
    });
    assert.equal(scrubAnalyticsUrl({ type: "pageview", url: "http://[" }), null);
    assert.equal(routePattern("/U/DonnieTaz"), "/u/[username]");
    assert.equal(scrubbed("/U/DonnieTaz"), "/u/[username]");
    assert.equal(routePattern("/u/x/cards"), "/[unknown]");
    assert.equal(routePattern("/u//cards/x"), "/[unknown]");
    assert.equal(routePattern("/u/a/cards/b/extra"), "/[unknown]");
    assert.equal(routePattern("/nope/secret"), "/[unknown]");
    assert.equal(scrubbed("/u/x/cards"), "/[unknown]");
    assert.equal(scrubbed("/u//cards/x"), "/[unknown]");
    assert.equal(scrubbed("/u/a/cards/b/extra"), "/[unknown]");
    assert.equal(scrubbed("/nope/secret"), "/[unknown]");
    assert.equal(scrubbed("/?utm_source=john%40doe.com"), "/");
    assert.equal(scrubbed("/?utm_source=hello%20world"), "/");
    assert.equal(scrubbed("/?utm_source=newsletter"), "/?utm_source=newsletter");
    assert.equal(scrubbed("/search?utm_source=john%40doe.com&utm_medium=email"), "/search?utm_medium=email");
  });

  it("rewrites every app page and drops non-campaign query params", () => {
    const patterns = pagePatterns(join(root, "app"));
    assert.ok(patterns.includes("/messages/[username]"));
    assert.ok(patterns.includes("/u/[username]/cards/[id]"));
    assert.ok(patterns.includes("/search"));
    for (const pattern of patterns) {
      const sample = samplePath(pattern);
      assert.equal(scrubbed(`${sample}?x=1`), pattern, sample);
      assert.equal(scrubbed(`${sample}?utm_source=x&foo=1`), `${pattern}?utm_source=x`, sample);
    }
  });

  it("matches the route table to app page files", () => {
    const fromFiles = pagePatterns(join(root, "app")).sort();
    const fromTable = [...PAGE_PATTERNS].sort();
    assert.deepEqual(fromTable, fromFiles);
  });
});

function viewAndVitals(href: string) {
  const pathname = new URL(href, "https://slabhold.local").pathname;
  const pattern = routePattern(pathname);
  const o = scrubAnalyticsUrl({ type: "pageview", url: href })?.url ?? null;
  const vitalUrl = scrubAnalyticsUrl({ type: "pageview", url: href })?.url;
  const vital = vitalUrl ? { url: vitalUrl, route: pattern } : null;
  return { o, dp: pattern, href: vital?.url ?? null, route: vital?.route ?? null };
}

describe("analytics payloads", () => {
  it("sends the route pattern and drops usernames, search text, and unsafe query params", () => {
    assert.deepEqual(viewAndVitals("/u/donnietaz?q=x"), {
      o: "/u/[username]",
      dp: "/u/[username]",
      href: "/u/[username]",
      route: "/u/[username]",
    });
    assert.deepEqual(viewAndVitals("/search?q=wemby"), {
      o: "/search",
      dp: "/search",
      href: "/search",
      route: "/search",
    });
    assert.deepEqual(viewAndVitals("https://slabhold.vercel.app/u/donnietaz?q=x"), {
      o: "https://slabhold.vercel.app/u/[username]",
      dp: "/u/[username]",
      href: "https://slabhold.vercel.app/u/[username]",
      route: "/u/[username]",
    });
    assert.deepEqual(viewAndVitals("https://slabhold.vercel.app/search?q=wemby"), {
      o: "https://slabhold.vercel.app/search",
      dp: "/search",
      href: "https://slabhold.vercel.app/search",
      route: "/search",
    });
    assert.deepEqual(viewAndVitals("/search?q=wemby&utm_source=newsletter"), {
      o: "/search?utm_source=newsletter",
      dp: "/search",
      href: "/search?utm_source=newsletter",
      route: "/search",
    });
    assert.deepEqual(viewAndVitals("/u/donnietaz?q=x&utm_source=john%40doe.com"), {
      o: "/u/[username]",
      dp: "/u/[username]",
      href: "/u/[username]",
      route: "/u/[username]",
    });

    const webAnalytics = read("components/web-analytics.tsx");
    assert.match(webAnalytics, /const pathname = usePathname\(\) \|\| "\/"/);
    assert.match(webAnalytics, /const pattern = routePattern\(pathname\)/);
    assert.match(
      webAnalytics,
      /<Analytics key=\{pathname\} route=\{pattern\} path=\{pattern\} beforeSend=\{scrubAnalyticsUrl\} \/>/,
    );
    assert.match(webAnalytics, /<SpeedInsights/);
    assert.match(webAnalytics, /route=\{pattern\}/);
    assert.match(webAnalytics, /scrubAnalyticsUrl\(\{ type: "pageview", url: e\.url \}\)\?\.url/);
    assert.equal((webAnalytics.match(/<SpeedInsights/g) ?? []).length, 1);
  });
});

describe("card_added", () => {
  it("fires after a successful save, and right after setCards in local mode", () => {
    const source = read("components/collection-provider.tsx");
    const addCard = source.slice(
      source.indexOf("const addCard = useCallback("),
      source.indexOf("const updateCard = useCallback("),
    );
    assert.match(
      addCard,
      /setCards\(next\);\r?\n\s*if \(mode === "local"\) trackEvent\("card_added"\);/,
    );
    assert.match(
      addCard,
      /await saveUserCard\(client, userId, card\);\r?\n\s*trackEvent\("card_added"\);/,
    );
    const catchStart = addCard.indexOf("} catch (error) {");
    assert.ok(catchStart > addCard.indexOf("await saveUserCard"));
    const catchBlock = addCard.slice(catchStart, addCard.indexOf("}", catchStart + 1));
    assert.match(catchBlock, /report\(error\)/);
    assert.doesNotMatch(catchBlock, /trackEvent/);
    assert.equal(addCard.match(/trackEvent\("card_added"\)/g)?.length, 2);
    const updateCard = source.slice(
      source.indexOf("const updateCard = useCallback("),
      source.indexOf("const removeCard = useCallback("),
    );
    assert.doesNotMatch(updateCard, /trackEvent/);
  });
});

describe("analytics wiring", () => {
  it("mounts both scripts once and fires the seven events from the product actions", () => {
    const layout = read("app/layout.tsx");
    const webAnalytics = read("components/web-analytics.tsx");
    assert.match(
      webAnalytics,
      /<Analytics key=\{pathname\} route=\{pattern\} path=\{pattern\} beforeSend=\{scrubAnalyticsUrl\} \/>/,
    );
    assert.match(webAnalytics, /from "@vercel\/analytics\/next"/);
    assert.match(webAnalytics, /from "@vercel\/speed-insights\/next"/);
    assert.equal((webAnalytics.match(/<SpeedInsights/g) ?? []).length, 1);
    assert.match(layout, /<WebAnalytics \/>/);
    assert.equal((layout.match(/<Analytics \/>/g) ?? []).length, 0);
    assert.equal((layout.match(/<SpeedInsights/g) ?? []).length, 0);
    assert.equal(layout.includes("@vercel/speed-insights/next"), false);
    assert.match(layout, /<CaptureUtm \/>/);

    const landing = read("components/landing-page.tsx");
    assert.match(landing, /trackEvent\("landing_cta_clicked", \{ button: "signup" \}\)/);
    assert.match(landing, /trackEvent\("landing_cta_clicked", \{ button: "login" \}\)/);

    const auth = read("components/auth-form.tsx");
    assert.match(auth, /trackEvent\("signup_started"\)/);
    assert.match(auth, /mode !== "signup"/);
    assert.match(auth, /trackEvent\("signup_completed", readStoredUtm\(\)\)/);

    assert.match(read("components/collection-provider.tsx"), /trackEvent\("card_added"\)/);
    assert.match(read("components/social-provider.tsx"), /trackEvent\("post_created"\)/);
    assert.match(read("components/mail-day-form.tsx"), /trackEvent\("card_added"\)/);
    assert.match(read("components/mail-day-form.tsx"), /trackEvent\("post_created"\)/);
    assert.match(read("components/follow-button.tsx"), /trackEvent\("follow_clicked"\)/);
    assert.match(read("components/share-button.tsx"), /trackEvent\("share_clicked"\)/);

    const privacy = read("app/privacy/page.tsx");
    assert.match(
      privacy,
      /We use Vercel Web Analytics and Speed Insights to count page views and measure performance,\s+with no ads and no cross-site tracking\. Page views record the page type \(no usernames, ids\s+or search text\) plus the referrer, country and device type\./,
    );
  });
});
