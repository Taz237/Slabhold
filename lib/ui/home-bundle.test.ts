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

describe("signed-out Home bundle", () => {
  it("renders the timeline only for a reader, from its own chunk", () => {
    const page = read("app/page.tsx");
    assert.doesNotMatch(page, /feed-view|moving-today-slot|"@\/components\/moving-today"|<FeedView|<MovingToday[ />]/);
    assert.match(page, /<HomeGate landing=\{<LandingPage founder=\{founder\} \/>\} movers=\{payload\} \/>/);

    const gate = read("components/home-gate.tsx");
    assert.ok(!staticImports(gate).includes("@/components/feed-view"));
    assert.ok(!staticImports(gate).includes("@/components/home-feed"));
    assert.match(gate, /return <HomeFeedLazy movers=\{movers\} \/>;/);
    assert.match(gate, /^if \(sessionHinted\(\)\) void HomeFeedLazy\.preload\(\)/m);

    const lazy = read("components/home-feed-lazy.tsx");
    assert.match(lazy, /lazyPart<[^>]*>\(\s*\(\) => import\("@\/components\/home-feed"\)/);
    assert.match(lazy, /<TimelineSkeleton \/>/);
    assert.ok(!staticImports(lazy).includes("@/components/feed-view"));
    assert.ok(!staticImports(lazy).includes("@/components/home-feed"));
  });

  it("keeps the signed-in chrome out of the shell's static imports", () => {
    const shell = read("components/app-shell.tsx");
    const imports = staticImports(shell);
    for (const heavy of [
      "@/components/side-menu",
      "@/components/create-menu",
      "@/components/onboarding/first-run-setup",
      "@/components/onboarding/youre-in",
      "@/components/onboarding/coach-tour",
      "@/components/badges/badge-reveal",
    ]) {
      assert.ok(!imports.includes(heavy), heavy);
      assert.match(shell, new RegExp(`lazyPart\\(\\(\\) => import\\("${heavy.replace(/\//g, "\\/")}"\\)`), heavy);
    }
    // A visitor's Log in slot stays static, so public pages draw the same on the server.
    assert.ok(imports.includes("@/components/guest-account"));
    assert.match(shell, /\{user \? <AccountMenu user=\{user\} showLogin=\{showLogin\} \/> : <GuestAccount showLogin=\{showLogin\} \/>\}/);
    assert.match(shell, /^if \(sessionHinted\(\)\) \{\s*for \(const part of \[AccountMenu, CreateMenu\]\) void part\.preload\(\)/m);
    assert.match(shell, /afterFirstIdle\(\(\) => \{\s*for \(const part of \[FirstRunSetup, YoureIn, CoachTour, BadgeRevealGate\]\)/);
    assert.doesNotMatch(shell, /from "next\/dynamic"/);
  });

  it("loads supabase-js after hydration in the app-wide providers", () => {
    for (const path of ["components/social-provider.tsx", "components/collection-provider.tsx"]) {
      const imports = staticImports(read(path));
      assert.ok(!imports.includes("@/lib/supabase/browser"), path);
      assert.ok(!imports.includes("@supabase/supabase-js"), path);
      assert.ok(!imports.includes("@supabase/ssr"), path);
    }
    const lazy = read("lib/supabase/browser-lazy.ts");
    assert.match(lazy, /import\("\.\/browser"\)/);
    assert.ok(!staticImports(lazy).includes("./browser"));
    const provider = read("components/social-provider.tsx");
    assert.match(provider, /^if \(sessionHinted\(\)\) void loadSupabaseBrowser\(\);$/m);
  });

  it("never boots supabase-js or the snapshot for a visitor on signed-out Home", () => {
    const provider = read("components/social-provider.tsx");
    assert.match(provider, /const engineStarted = useEngineStart\(\);/);
    const boot = provider.slice(provider.indexOf("// supabase-js loads in its own chunk") - 600, provider.indexOf("// supabase-js loads in its own chunk"));
    assert.match(boot, /if \(!engineStarted\) return;/);
    assert.match(provider, /\}, \[engineStarted\]\);/);
  });

  it("defers signed-out realtime and card prices to the first idle moment", () => {
    const provider = read("components/social-provider.tsx");
    assert.match(provider, /useEffect\(\(\) => afterFirstIdle\(\(\) => setFirstIdle\(true\)\), \[\]\);/);
    assert.match(provider, /if \(!viewerId && !firstIdle\) return;/);
    assert.match(provider, /const holdCardValues = !snapshot\.user && !firstIdle;/);
  });

  it("reads the install platform without the install guide", () => {
    const gate = read("components/onboarding/standalone-login.tsx");
    assert.ok(staticImports(gate).includes("@/components/onboarding/use-install-platform"));
    assert.ok(!staticImports(gate).includes("@/components/onboarding/install-step"));
    assert.ok(!staticImports(read("components/onboarding/use-install-platform.ts")).includes("@/components/onboarding/install-step"));
  });

  it("draws the landing page on the server, so it ships no code and never redraws", () => {
    for (const path of [
      "components/landing-page.tsx",
      "components/landing/hero-slabs.tsx",
      "components/landing/founder-note.tsx",
      "components/card-slab-frame.tsx",
    ]) {
      assert.doesNotMatch(read(path), /^"use client";/m, path);
    }
    const gate = read("components/home-gate.tsx");
    assert.ok(!staticImports(gate).includes("@/components/landing-page"));
    assert.match(gate, /<StandaloneLoginGate>\s*\{landing\}\s*<\/StandaloneLoginGate>/);
    // The hero's LCP photo is a plain <img> from next/image's getImageProps, preloaded from the head.
    const hero = read("components/landing/hero-slabs.tsx");
    assert.match(hero, /getImageProps\(/);
    assert.match(hero, /preload\(props\.src, \{/);
    assert.ok(!staticImports(hero).includes("@/components/card-slab-art"));
  });
});
