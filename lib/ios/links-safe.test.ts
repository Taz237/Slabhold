import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { safeAppPath } from "@/lib/ios/links";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("safeAppPath", () => {
  it("keeps Slabhold pages", () => {
    for (const path of ["/u/demo/cards/9?ref=share", "/posts/1#top", "/", "/collection", "/authors-corner"]) {
      assert.equal(safeAppPath(path), path);
    }
  });

  it("drops API, build, AASA and auth paths, other sites and nothing", () => {
    for (const path of [
      "/api/x",
      "/api",
      "/_next/x",
      "/.well-known/x",
      "/auth/callback",
      "/auth/app-return",
      "/API/x",
      "//evil.com",
      "/\\evil.com",
      "https://evil.com/",
      "u/demo",
      "",
      null,
    ]) {
      assert.equal(safeAppPath(path), null, String(path));
    }
  });
});

describe("safeAppPath in the native shell", () => {
  const native = read("lib/ios/native.ts");

  it("runs on links that open the app, after the sign-in return", () => {
    const listener = native.slice(native.indexOf('App.addListener("appUrlOpen"'), native.indexOf("App.getLaunchUrl()"));
    assert.ok(listener.indexOf("oauthReturnPath(link)") > 0);
    assert.ok(listener.indexOf("const path = safeAppPath(link);") > listener.indexOf("oauthReturnPath(link)"));
    assert.match(listener, /if \(path && path !== currentPath\(\)\) navigate\(path\);/);
  });

  it("runs on the launch link, after the sign-in return", () => {
    const launch = native.slice(native.indexOf("App.getLaunchUrl()"), native.indexOf("countLaunch("));
    assert.match(launch, /oauthReturnPath\(link\) \?\? safeAppPath\(link\)/);
  });
});
