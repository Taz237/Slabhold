import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { MailDayTileBody } from "@/components/mail-day-card";
import {
  mailDayDetailLine,
  mailDayOgTitle,
  mailDayPlayerLine,
  mailDayShareName,
  mailDayTileLayout,
  shareTitleForPost,
} from "./mail-day-copy";

const mccarthy = {
  playerName: "J.J. McCarthy",
  year: 2024,
  yearLabel: "2024",
  setBrand: "Donruss Optic",
  parallel: "Pink",
  cardNumber: "303",
  isRookie: false,
};

describe("mail day title and subtitle", () => {
  it("puts the player on the first line and the card facts on the second", () => {
    assert.equal(mailDayPlayerLine(mccarthy), "J.J. McCarthy");
    assert.equal(mailDayDetailLine(mccarthy), "2024 Donruss Optic · Pink · #303");
    assert.equal(mailDayShareName(mccarthy), "J.J. McCarthy 2024 Donruss Optic Pink #303");
  });

  it("adds RC when the card is a rookie and skips Base", () => {
    assert.equal(
      mailDayDetailLine({ ...mccarthy, parallel: "Base", isRookie: true }),
      "2024 Donruss Optic · #303 · RC",
    );
    assert.match(mailDayShareName({ ...mccarthy, isRookie: true }), / RC$/);
  });

  it("shows Optic Preview-Pink and Optic Preview Pink as the same line", () => {
    const hyphen = mailDayDetailLine({
      ...mccarthy,
      setBrand: "Panini Donruss",
      parallel: "Optic Preview-Pink",
    });
    const spaced = mailDayDetailLine({
      ...mccarthy,
      setBrand: "Panini Donruss",
      parallel: "Optic Preview Pink",
    });
    assert.equal(hyphen, "2024 Panini Donruss · Optic Preview Pink · #303");
    assert.equal(hyphen, spaced);
  });

  it("builds the Open Graph line from the card name", () => {
    const title = mailDayOgTitle(mccarthy);
    assert.equal(title, "J.J. McCarthy 2024 Donruss Optic Pink #303 | Slabhold");
    assert.doesNotMatch(title, /Mail Day/i);
    assert.equal(mailDayOgTitle({ playerName: "  " }), "");
  });

  it("uses a hero for one card and the grid for two or more", () => {
    assert.equal(mailDayTileLayout(1), "hero");
    assert.equal(mailDayTileLayout(2), "grid");
    assert.equal(mailDayTileLayout(0), "grid");
  });

  it("shares the card name, and skips a private Mail Day card", () => {
    assert.equal(
      shareTitleForPost({
        postType: "mail_day",
        mailDayCards: [{ showValue: true, card: mccarthy }],
      }),
      "J.J. McCarthy 2024 Donruss Optic Pink #303",
    );
    assert.equal(
      shareTitleForPost({
        postType: "mail_day",
        card: mccarthy,
        mailDay: { showValue: false },
        mailDayCards: [{ showValue: false, card: mccarthy }],
      }),
      "Slabhold",
    );
    assert.doesNotMatch(
      shareTitleForPost({
        postType: "mail_day",
        card: mccarthy,
        mailDay: { showValue: false },
      }),
      /Mail Day/i,
    );
    assert.equal(shareTitleForPost({ card: mccarthy }), mailDayShareName(mccarthy));
    assert.equal(shareTitleForPost({}), "Slabhold");
  });
});

describe("mail day tile markup", () => {
  const photo = "https://example.com/mccarthy.jpg";

  it("renders one card as a full-width hero with the player name intact", () => {
    const html = renderToStaticMarkup(
      createElement(MailDayTileBody, {
        hero: true,
        player: "J.J. McCarthy",
        detail: "2024 Donruss Optic · Pink · #303",
        photos: [photo],
        href: "/u/kyleeshaye444/cards/abc",
        priceLabel: null,
        soldHref: "https://www.ebay.com/sch/i.html?_nkw=test&LH_Sold=1&LH_Complete=1",
        sourceLabel: null,
        paidLabel: null,
        onOpen: () => undefined,
      }),
    );
    assert.match(html, /data-mail-day-layout="hero"/);
    assert.match(html, /data-photo-fit="contain"/);
    assert.match(html, /aspect-\[4\/5\]/);
    assert.match(html, /object-contain/);
    assert.doesNotMatch(html, /w-\[72%\]/);
    assert.doesNotMatch(html, /truncate/);
    assert.match(html, /J\.J\. McCarthy/);
    assert.match(html, /2024 Donruss Optic · Pink · #303/);
    assert.match(html, /Search recent sales/);
    assert.doesNotMatch(html, /See eBay sold/);
    assert.doesNotMatch(html, /Sold comps via Trawl/);
    assert.doesNotMatch(html, /fee/i);
    assert.doesNotMatch(html, /Trawl/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.doesNotMatch(html, /Not enough sales yet/);
    assert.doesNotMatch(html, />eBay</);
  });

  it("keeps the grid for two cards and still leads with the player", () => {
    const html = renderToStaticMarkup(
      createElement(MailDayTileBody, {
        hero: false,
        player: "J.J. McCarthy",
        detail: "2024 Donruss Optic · Pink · #303",
        photos: [photo],
        href: null,
        priceLabel: "$35.00",
        soldHref: null,
        sourceLabel: "Card show",
        paidLabel: "Paid $12.00",
        onOpen: () => undefined,
      }),
    );
    assert.match(html, /data-mail-day-layout="grid"/);
    assert.match(html, /w-\[72%\]/);
    assert.match(html, /object-cover/);
    assert.match(html, /J\.J\. McCarthy/);
    assert.match(html, /\$35\.00/);
    assert.match(html, /Card show/);
    assert.match(html, /Paid \$12\.00/);
    assert.doesNotMatch(html, /Search recent sales/);
    assert.doesNotMatch(html, /Sold comps via Trawl/);
    assert.doesNotMatch(html, /See eBay sold/);
    assert.doesNotMatch(html, />eBay</);
  });
});
