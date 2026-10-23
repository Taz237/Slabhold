import assert from "node:assert/strict";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EXTERNAL_LINK_REL, MentionText } from "@/components/mention-text";
import {
  GET_STARTED_CHECKLIST_HREF,
  URL_DISPLAY_LIMIT,
  displayUrl,
  safeHttpHref,
  splitPostText,
  type PostTextPart,
} from "@/lib/social/post-text";

function htmlFor(text: string) {
  return renderToStaticMarkup(createElement(MentionText, { text }));
}

function urls(text: string) {
  return splitPostText(text).filter((part) => part.type === "url");
}

function hashtags(text: string) {
  return splitPostText(text).filter((part) => part.type === "hashtag");
}

function hrefs(markup: string) {
  return [...markup.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

describe("splitPostText links and hashtags", () => {
  it("keeps @mentions and the checklist phrase", () => {
    const text =
      "Joining Slabhold is easier, with a Get started checklist for new collectors. Ask @slabhold.";
    const parts = splitPostText(text);
    assert.deepEqual(
      parts.filter((part) => part.type !== "text").map((part) => part.text),
      ["Get started checklist", "@slabhold"],
    );
    const checklist = parts.find((part) => part.type === "checklist");
    assert.equal(checklist && checklist.type === "checklist" ? checklist.href : "", GET_STARTED_CHECKLIST_HREF);
    const mention = parts.find((part) => part.type === "mention");
    assert.equal(mention && mention.type === "mention" ? mention.username : "", "slabhold");
  });

  it("linkifies http and https, strips trailing punctuation, and keeps balanced parens", () => {
    const sentence = "See (https://ebay.com/itm/12). Also http://example.com/a, and https://en.wikipedia.org/wiki/URL_(disambiguation).";
    const found = urls(sentence);
    assert.deepEqual(
      found.map((part) => (part.type === "url" ? part.text : "")),
      [
        "https://ebay.com/itm/12",
        "http://example.com/a",
        "https://en.wikipedia.org/wiki/URL_(disambiguation)",
      ],
    );
    assert.equal(found[0]?.type === "url" ? found[0].href : "", "https://ebay.com/itm/12");
    assert.equal(found[0]?.type === "url" ? found[0].display : "", "ebay.com/itm/12");
  });

  it("upgrades a bare www host to https and leaves the period off the link", () => {
    const [only] = urls("Look www.example.com/path.");
    assert.ok(only && only.type === "url");
    assert.equal(only.href, "https://www.example.com/path");
    assert.equal(only.display, "www.example.com/path");
    assert.equal(only.text, "www.example.com/path");
  });

  it("shortens a long display and keeps the full https href", () => {
    const raw = `https://ebay.com/itm/${"1234567890".repeat(4)}`;
    const [only] = urls(raw);
    assert.ok(only && only.type === "url");
    assert.equal(only.href, raw);
    assert.equal(only.display.length, URL_DISPLAY_LIMIT);
    assert.ok(only.display.endsWith("…"));
    assert.ok(only.display.startsWith("ebay.com/itm/"));
    assert.equal(displayUrl(raw).length, URL_DISPLAY_LIMIT);
  });

  it("does not linkify javascript or data schemes, including mixed case and slash tricks", () => {
    const samples = [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "JavaScript:alert(document.domain)",
      "data:text/html,hi",
      "DATA:text/html,<script>alert(1)</script>",
      "javascript://example.com/%0Aalert(1)",
      "data:text/html,https://ok.example/nested",
      "//evil.com",
      "http:/evil.com",
      "https:example.com",
      "notwww.example.com",
    ];
    for (const sample of samples) {
      const linked = urls(sample).filter((part) => part.type === "url");
      for (const part of linked) {
        assert.equal(part.type, "url");
        assert.match(part.href, /^https?:\/\//);
        assert.doesNotMatch(part.href, /^javascript:/i);
        assert.doesNotMatch(part.href, /^data:/i);
      }
      if (!/https?:\/\//i.test(sample) && !/(^|[^a-zA-Z0-9_])www\./i.test(sample)) {
        assert.equal(linked.length, 0, sample);
      }
    }
    assert.equal(safeHttpHref("javascript:alert(1)"), null);
    assert.equal(safeHttpHref("data:text/html,hi"), null);
    assert.equal(safeHttpHref("JAVASCRIPT:alert(1)"), null);
    assert.equal(safeHttpHref("https://example"), null);
  });

  it("keeps a real https URL that is written next to a javascript: scheme", () => {
    const found = urls("skip javascript:alert(1) then https://ok.example/a");
    assert.equal(found.length, 1);
    assert.equal(found[0]?.type === "url" ? found[0].href : "", "https://ok.example/a");
  });

  it("links #hashtags to search and ignores short, glued, and over-long tags", () => {
    const text = "Pulling #PSA10 and #ab. Not #a or foo#bar or #" + "a".repeat(31);
    const tags = hashtags(text);
    assert.deepEqual(
      tags.map((part) => (part.type === "hashtag" ? part.tag : "")),
      ["PSA10", "ab"],
    );
    assert.equal(tags[0]?.type === "hashtag" ? tags[0].href : "", "/search?q=%23PSA10");
    assert.equal(tags[0]?.type === "hashtag" ? tags[0].text : "", "#PSA10");
    const exact = "a".repeat(30);
    const [long] = hashtags(`#${exact}`);
    assert.equal(long?.type === "hashtag" ? long.tag : "", exact);
    assert.equal(hashtags(`#${"b".repeat(31)}`).length, 0);
  });

  it("does not also hashtag the hash inside a URL, and still finds a mention beside both", () => {
    const parts = splitPostText("Hey @donnie https://slabhold.app/search?q=%23psa #mail");
    const kinds = parts.filter((part) => part.type !== "text").map((part) => part.type);
    assert.deepEqual(kinds, ["mention", "url", "hashtag"]);
    const url = parts.find((part) => part.type === "url");
    assert.equal(url && url.type === "url" ? url.text : "", "https://slabhold.app/search?q=%23psa");
    assert.equal(parts.some((part) => part.type === "hashtag" && part.tag === "psa"), false);
  });

  it("leaves an email as plain text", () => {
    const parts = splitPostText("mail ada@example.com");
    assert.equal(parts.some((part) => part.type !== "text"), false);
  });
});

describe("MentionText rendering", () => {
  it("escapes markup and never puts a dangerous scheme in href", () => {
    const html = htmlFor(
      'hello <script>alert(1)</script> <img src=x onerror="alert(1)"> javascript:alert(1) data:text/html,boom https://ok.example/a?q=1&x=2',
    );
    assert.doesNotMatch(html, /<script>/i);
    assert.doesNotMatch(html, /<img/i);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /dangerouslySetInnerHTML/);
    assert.deepEqual(hrefs(html), ["https://ok.example/a?q=1&amp;x=2"]);
    assert.match(html, new RegExp(`rel="${EXTERNAL_LINK_REL}"`));
    assert.match(html, /target="_blank"/);
    assert.match(html, />ok\.example\/a\?q=1&amp;x=2</);
    for (const href of hrefs(html)) {
      assert.match(href, /^https?:\/\//);
      assert.doesNotMatch(href, /javascript:/i);
      assert.doesNotMatch(href, /^data:/i);
    }
  });

  it("renders a hashtag as a search link and a mention as a profile link", () => {
    const html = htmlFor("Nice #mail day @donnie");
    assert.match(html, /href="\/search\?q=%23mail"/);
    assert.match(html, />#mail</);
    assert.match(html, /href="\/u\/donnie"/);
    assert.match(html, />@donnie</);
  });

  it("shows a trimmed URL, not the raw scheme", () => {
    const raw = `HTTPS://Example.COM/${"segment".repeat(6)}`;
    const html = htmlFor(raw);
    assert.match(html, /href="https:\/\/example\.com\//);
    assert.doesNotMatch(html, />HTTPS:\/\//);
    const visible = html.match(/>([^<]*…)</);
    assert.ok(visible);
    assert.ok((visible[1] ?? "").length <= URL_DISPLAY_LIMIT);
  });

  it("uses MentionText for DM bubbles", () => {
    const thread = readFileSync(join(process.cwd(), "components/message-thread.tsx"), "utf8");
    assert.match(thread, /<MentionText/);
    assert.match(thread, /text=\{message\.content\}/);
    assert.doesNotMatch(thread, />\s*\{message\.content\}\s*</);
  });
});

function isUrl(part: PostTextPart): part is Extract<PostTextPart, { type: "url" }> {
  return part.type === "url";
}

describe("safeHttpHref", () => {
  it("rejects non-http schemes even when the string contains http later", () => {
    assert.equal(safeHttpHref("javascript:http://example.com"), null);
    assert.equal(safeHttpHref("data:text/html,http://example.com"), null);
    const kept = splitPostText("data:text/html,http://example.com").filter(isUrl);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.href, "http://example.com/");
  });
});
