import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Static (non-type) imports of a module, by specifier. */
function staticImports(source: string): string[] {
  return [...source.matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gm)].map((match) => match[1]);
}

/**
 * Files on the heavy app screens (profile, add/edit card, compose, DMs,
 * search, notifications, login and sign-up) that load supabase-js after
 * hydration. A static import of the client pulls about 65 KB gz back into
 * each of those routes' first load.
 */
const LAZY_FILES = [
  "components/auth-form.tsx",
  "components/card-people.tsx",
  "components/card-posts-list.tsx",
  "components/collect-editor.tsx",
  "components/collect-settings.tsx",
  "components/compose-view.tsx",
  "components/feed-view.tsx",
  "components/forgot-password-form.tsx",
  "components/hunter-setting.tsx",
  "components/invite/invite-button.tsx",
  "components/invite/invite-settings.tsx",
  "components/invite/invite-welcome.tsx",
  "components/onboarding/first-run-setup.tsx",
  "components/onboarding/use-username-check.ts",
  "components/profile-view.tsx",
  "components/reset-password-form.tsx",
  "components/trending-now.tsx",
  "components/use-paged-timeline.ts",
  "components/value-board.tsx",
  "components/want-list.tsx",
  "lib/badges/save.ts",
  "lib/catalog/catalog-queue.ts",
  "lib/catalog/search-remote.ts",
  "lib/deals/client.ts",
];

describe("app screens bundle", () => {
  for (const path of LAZY_FILES) {
    it(`${path} loads supabase-js after hydration`, () => {
      const imports = staticImports(read(path));
      assert.ok(!imports.includes("@/lib/supabase/browser"), path);
      assert.ok(!imports.includes("@supabase/supabase-js"), path);
      assert.ok(!imports.includes("@supabase/ssr"), path);
      assert.ok(!imports.includes("@/lib/social/remote"), path);
      assert.ok(imports.includes("@/lib/supabase/browser-lazy"), path);
    });
  }
});
