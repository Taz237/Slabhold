import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boardHtml, items, listHtml, pageModel, render, row, rows, snap } from "@/lib/test/leaderboard-view";
import { profileCardsLinkFor } from "./profile-link";

describe("rows open the Cards tab", () => {
  it("adds ?tab=cards to clean profile links and leaves odd handles unlinked", () => {
    const base = row("ok", 1);
    assert.equal(profileCardsLinkFor(base), "/u/ok?tab=cards");
    assert.equal(profileCardsLinkFor({ ...base, subtitle: "@Card_Guy", href: "/posts/p1" }), "/u/Card_Guy?tab=cards");
    assert.equal(profileCardsLinkFor({ ...base, subtitle: "", href: "/u/ok" }), "/u/ok?tab=cards");
    assert.equal(profileCardsLinkFor({ ...base, subtitle: "", href: "/posts/p1" }), null);
    assert.equal(profileCardsLinkFor({ ...base, subtitle: "@two words", href: "/posts/p1" }), null);
    assert.equal(profileCardsLinkFor({ ...base, subtitle: "@a/b", href: "/posts/p1" }), null);
    assert.equal(profileCardsLinkFor({ ...base, subtitle: "@..", href: "/posts/p1" }), null);
  });

  it("links podium places and slim rows on every board to the Cards tab", () => {
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
        assert.match(item.body, new RegExp(`href="/u/u${index}\\?tab=cards"`), `${boardId} rank ${index + 1}`);
      }
      assert.doesNotMatch(section, /href="\/u\/u\d+"/);
    }
  });

  it("keeps an odd handle unlinked on the podium", () => {
    const section = boardHtml(
      render(pageModel(snap({ "top-card-post": [row("odd", 5, { subtitle: "@a/b", href: "/posts/odd" }), row("fine", 2)] }))),
      "top-card-post",
    );
    const [odd, fine] = items(listHtml(section, "data-podium") ?? "");
    assert.doesNotMatch(odd!.body, /<a /);
    assert.match(fine!.body, /href="\/u\/fine\?tab=cards"/);
  });
});
