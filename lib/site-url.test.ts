import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { emailConfirmRedirect } from "@/lib/auth/safe-next";
import { passwordResetEmailOptions } from "@/lib/auth/password-reset";
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

  it("uses SITE_URL for metadata and share links in production", () => {
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
    assert.equal(
      publicOrigin("https://slabhold.vercel.app", { VERCEL_ENV: "production" }),
      "https://slabhold.app",
    );
    assert.match(read(".env.example"), /NEXT_PUBLIC_SITE_URL=https:\/\/slabhold\.app/);
    assert.match(read("next.config.ts"), /NEXT_PUBLIC_VERCEL_ENV/);
  });

  it("keeps reset and signup email redirects on the browser origin", () => {
    const origins = [
      "https://slabhold.vercel.app",
      "https://slabhold.app",
      "https://slabhold-git-preview.vercel.app",
    ];
    for (const origin of origins) {
      const reset = passwordResetEmailOptions(origin, null).redirectTo;
      assert.equal(new URL(reset).origin, origin);
      assert.equal(reset, `${origin}/auth/callback?next=/reset-password`);
      const signup = emailConfirmRedirect(origin, "/");
      assert.equal(new URL(signup).origin, origin);
      assert.equal(signup, `${origin}/auth/confirm?next=%2F`);
    }
    const forgot = read("components/forgot-password-form.tsx");
    const remote = read("lib/social/remote.ts");
    assert.match(forgot, /passwordResetEmailOptions\(window\.location\.origin, captchaToken\)/);
    assert.match(remote, /emailConfirmRedirect\(window\.location\.origin, input\.next\)/);
    assert.doesNotMatch(forgot, /publicOrigin/);
    assert.doesNotMatch(remote, /publicOrigin/);
  });
});
