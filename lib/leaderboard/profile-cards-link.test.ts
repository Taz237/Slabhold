import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boardHtml, items, listHtml, pageModel, render, row, rows, snap } from "@/lib/test/leaderboard-view";
import { profileLinkFor } from "./profile-link";
import { profileCardsRedirect } from "@/lib/social/profile-tabs";

describe("rows open the collector's profile", () => {
  it("links clean profiles to /u/<handle> and leaves odd handles unlinked", () => {
    const base = row("ok", 1);
    assert.equal(profileLinkFor(base), "/u/ok");
    assert.equal(profileLinkFor({ ...base, subtitle: "@Card_Guy", href: "/posts/p1" }), "/u/Card_Guy");
    assert.equal(profileLinkFor({ ...base, subtitle: "", href: "/u/ok" }), "/u/ok");
    assert.equal(profileLinkFor({ ...base, subtitle: "", href: "/posts/p1" }), null);
    assert.equal(profileLinkFor({ ...base, subtitle: "@two words", href: "/posts/p1" }), null);
    assert.equal(profileLinkFor({ ...base, subtitle: "@a/b", href: "/posts/p1" }), null);
    assert.equal(profileLinkFor({ ...base, subtitle: "@..", href: "/posts/p1" }), null);
  });

  it("links podium places and slim rows on every board to the profile, not the cards grid or the old tab", () => {
    const markup = render(
      pageModel(snap({ "most-cards-added": rows(5), "rising-collectors": rows(5), "top-card-post": rows(5) })),
    );
    for (const boardId of ["most-cards-added", "rising-collectors", "top-card-post"]) {
      const section = boardHtml(markup, boardId);
      const podium = items(listHtml(section, "data-podium") ?? "");
      const slim = items(listHtml(section, "data-rank-rows") ?? "");
      assert.equal(podium.length, 3);
      assert.equal(slim.length, 2);
      for (const [index, item] of [...podium, ...slim].entries()) {
        assert.match(item.body, new RegExp(`href="/u/u${index}"`), `${boardId} rank ${index + 1}`);
      }
      assert.doesNotMatch(section, /href="\/u\/u\d+(?:\/cards|\?tab=cards)"/);
    }
  });

  it("keeps an odd handle unlinked on the podium", () => {
    const section = boardHtml(
      render(pageModel(snap({ "top-card-post": [row("odd", 5, { subtitle: "@a/b", href: "/posts/odd" }), row("fine", 2)] }))),
      "top-card-post",
    );
    const [odd, fine] = items(listHtml(section, "data-podium") ?? "");
    assert.doesNotMatch(odd!.body, /<a /);
    assert.match(fine!.body, /href="\/u\/fine"/);
  });

  it("still sends old shared Cards-tab links to the grid", () => {
    assert.equal(profileCardsRedirect("cards", "ok"), "/u/ok/cards");
    assert.equal(profileCardsRedirect("collection", "ok"), "/u/ok/cards");
  });
});
