import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { SITE_URL, isPreviewDeployment, publicOrigin, siteUrlFrom } from "./site-url";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("SITE_URL", () => {
  it("defaults to https://slabhold.app and strips a trailing slash", () => {
    assert.equal(
      SITE_URL,
      (process.env.NEXT_PUBLIC_SITE_URL || "https://slabhold.app").replace(/\/$/, ""),
    );
    assert.equal(siteUrlFrom(undefined), "https://slabhold.app");
    assert.equal(siteUrlFrom(""), "https://slabhold.app");
    assert.equal(siteUrlFrom("https://slabhold.app/"), "https://slabhold.app");
    assert.equal(siteUrlFrom("https://example.com/"), "https://example.com");
    assert.equal(SITE_URL.includes("vercel.app"), false);
  });

  it("keeps the browser origin only for Vercel preview deployments", () => {
    const preview = "https://slabhold-git-preview.vercel.app";
    assert.equal(isPreviewDeployment({ VERCEL_ENV: "preview" }), true);
    assert.equal(isPreviewDeployment({ NEXT_PUBLIC_VERCEL_ENV: "preview" }), true);
    assert.equal(isPreviewDeployment({ VERCEL_ENV: "production" }), false);
    assert.equal(isPreviewDeployment({}), false);
    assert.equal(
      publicOrigin(`${preview}/`, { VERCEL_ENV: "preview" }),
      preview,
    );
    assert.equal(
      publicOrigin(preview, { NEXT_PUBLIC_VERCEL_ENV: "preview" }),
      preview,
    );
    assert.equal(
      publicOrigin("http://localhost:3000", {
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SITE_URL: "https://slabhold.app/",
      }),
      "https://slabhold.app",
    );
    assert.equal(publicOrigin("http://localhost:3000", {}), "https://slabhold.app");
    assert.equal(
      publicOrigin(null, { VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: "https://slabhold.app" }),
      "https://slabhold.app",
    );
  });

  it("uses SITE_URL for metadata, share links, and auth redirects", () => {
    const source = read("lib/site-url.ts");
    assert.match(
      source,
      /export const SITE_URL = \(process\.env\.NEXT_PUBLIC_SITE_URL \|\| "https:\/\/slabhold\.app"\)\.replace\(\/\\\/\$\/, ""\)/,
    );
    const layout = read("app/layout.tsx");
    assert.match(layout, /metadataBase: new URL\(SITE_URL\)/);
    assert.match(layout, /canonical: "\.\/"/);
    assert.doesNotMatch(layout, /slabhold\.vercel\.app/);
    assert.match(read("components/share-button.tsx"), /publicOrigin\(window\.location\.origin\)/);
    assert.match(
      read("components/forgot-password-form.tsx"),
      /publicOrigin\(window\.location\.origin\)/,
    );
    assert.match(read("lib/social/remote.ts"), /publicOrigin\(window\.location\.origin\)/);
    assert.match(read(".env.example"), /NEXT_PUBLIC_SITE_URL=https:\/\/slabhold\.app/);
    assert.match(read("next.config.ts"), /NEXT_PUBLIC_VERCEL_ENV/);
  });
});
