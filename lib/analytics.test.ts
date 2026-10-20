import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { sanitizeProps, trackEvent } from "./analytics";

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

describe("analytics wiring", () => {
  it("mounts both scripts once and fires the seven events from the product actions", () => {
    const layout = read("app/layout.tsx");
    assert.equal((layout.match(/<Analytics \/>/g) ?? []).length, 1);
    assert.equal((layout.match(/<SpeedInsights \/>/g) ?? []).length, 1);
    assert.match(layout, /from "@vercel\/analytics\/next"/);
    assert.match(layout, /from "@vercel\/speed-insights\/next"/);
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
      /We use Vercel Web Analytics and Speed Insights to count page views and measure performance,\s+with no ads and no cross-site tracking\./,
    );
  });
});
