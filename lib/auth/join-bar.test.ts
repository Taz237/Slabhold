import assert from "node:assert/strict";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { join } from "node:path";
import { JoinBarView } from "@/components/join-bar";
import { shouldShowJoinBar } from "./guest-paths";
import { signupPath } from "./safe-next";

function renderJoinBar(signedIn: boolean, pathname: string) {
  if (!shouldShowJoinBar(signedIn, pathname)) return "";
  return renderToStaticMarkup(createElement(JoinBarView, { pathname }));
}

describe("join bar", () => {
  it("renders for signed-out post, card, and profile pages with the current path", () => {
    const post = renderJoinBar(false, "/posts/abc");
    assert.match(post, /data-join-bar/);
    assert.match(post, /Join Slabhold/);
    assert.match(post, /href="\/signup\?next=%2Fposts%2Fabc"/);
    assert.match(post, /href="\/login\?next=%2Fposts%2Fabc"/);
    assert.match(post, />Sign up</);
    assert.match(post, />Log in</);

    const card = renderJoinBar(false, "/u/sam/cards/abc");
    assert.match(card, /data-join-bar/);
    assert.match(card, /href="\/signup\?next=%2Fu%2Fsam%2Fcards%2Fabc"/);

    const profile = renderJoinBar(false, "/u/sam");
    assert.match(profile, /data-join-bar/);
    assert.match(profile, /href="\/signup\?next=%2Fu%2Fsam"/);

    const search = renderToStaticMarkup(
      createElement(JoinBarView, { pathname: "/search?q=wemby" }),
    );
    assert.match(search, /href="\/signup\?next=%2Fsearch%3Fq%3Dwemby"/);
    assert.match(search, /href="\/login\?next=%2Fsearch%3Fq%3Dwemby"/);
  });

  it("does not render when signed in", () => {
    assert.equal(renderJoinBar(true, "/posts/abc"), "");
    assert.equal(renderJoinBar(true, "/u/sam/cards/abc"), "");
    assert.equal(renderJoinBar(true, "/u/sam"), "");
    assert.equal(shouldShowJoinBar(false, "/terms"), false);
  });
});

describe("signed-out like and follow", () => {
  it("routes to signup with the current path", () => {
    assert.equal(signupPath("/posts/abc"), "/signup?next=%2Fposts%2Fabc");
    assert.equal(signupPath("/u/sam"), "/signup?next=%2Fu%2Fsam");
    const root = process.cwd();
    const follow = readFileSync(join(root, "components/follow-button.tsx"), "utf8");
    const tweet = readFileSync(join(root, "components/tweet.tsx"), "utf8");
    assert.match(follow, /signupPath\(pathname\)/);
    assert.doesNotMatch(follow, /href="\/login"/);
    assert.match(tweet, /signupPath\(pathname\)/);
    assert.doesNotMatch(tweet, /router\.push\("\/login"\)/);
  });
});
