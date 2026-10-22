import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { isShareAbort, postSharePayload, shareOrCopy, type SharePayload } from "./sheet";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const payload: SharePayload = {
  title: "Maya",
  text: "Maya",
  url: "https://slabhold.app/posts/abc",
};

describe("post share payload", () => {
  it("uses the card name as the title and the post as the text", () => {
    assert.deepEqual(
      postSharePayload({
        title: "J.J. McCarthy 2024 Panini Donruss Optic Preview Pink #303",
        text: "Mail day",
        url: "https://slabhold.app/posts/abc",
      }),
      {
        title: "J.J. McCarthy 2024 Panini Donruss Optic Preview Pink #303",
        text: "Mail day",
        url: "https://slabhold.app/posts/abc",
      },
    );
    assert.equal(
      postSharePayload({ title: "Mail Day", text: "  ", url: "https://slabhold.app/posts/abc" }).text,
      "Mail Day",
    );
  });
});

describe("share sheet", () => {
  it("uses navigator.share when it is available and does not copy", async () => {
    const shared: SharePayload[] = [];
    let copied = 0;
    const result = await shareOrCopy(payload, {
      share: async (data) => {
        shared.push(data);
      },
      copy: async () => {
        copied += 1;
        return true;
      },
    });
    assert.equal(result, "shared");
    assert.deepEqual(shared, [payload]);
    assert.equal(shared[0]?.text, payload.title);
    assert.equal(copied, 0);
  });

  it("ignores AbortError and does not copy or toast", async () => {
    let copied = 0;
    const abort = new Error("Share canceled");
    abort.name = "AbortError";
    const result = await shareOrCopy(payload, {
      share: async () => {
        throw abort;
      },
      copy: async () => {
        copied += 1;
        return true;
      },
    });
    assert.equal(isShareAbort(abort), true);
    assert.equal(result, "cancelled");
    assert.equal(copied, 0);

    const domAbort = new DOMException("The user aborted a request.", "AbortError");
    const domResult = await shareOrCopy(payload, {
      share: async () => {
        throw domAbort;
      },
      copy: async () => {
        copied += 1;
        return true;
      },
    });
    assert.equal(domResult, "cancelled");
    assert.equal(copied, 0);
  });

  it("copies the same URL when share is missing or throws something else", async () => {
    const copied: string[] = [];
    const copy = async (url: string) => {
      copied.push(url);
      return true;
    };

    const missing = await shareOrCopy(payload, { copy });
    assert.equal(missing, "copied");

    const failed = await shareOrCopy(payload, {
      share: async () => {
        throw new Error("Share not allowed");
      },
      copy,
    });
    assert.equal(failed, "copied");
    assert.deepEqual(copied, [payload.url, payload.url]);

    const hardFail = await shareOrCopy(payload, {
      copy: async () => false,
    });
    assert.equal(hardFail, "failed");
  });

  it("keeps the slabhold.app URL, the 44px control, and the copy toast", () => {
    const button = read("components/share-button.tsx");
    assert.match(button, /publicOrigin\(window\.location\.origin\)/);
    assert.match(button, /new URL\(path,/);
    assert.match(button, /navigator\.share\?\.bind\(navigator\)/);
    assert.match(button, /postSharePayload\(/);
    assert.match(button, /shareOrCopy\(/);
    assert.match(button, /trackEvent\("share_clicked"\)/);
    assert.match(button, /Link copied/);
    assert.match(button, /if \(result !== "copied"\) return/);
    assert.match(button, /aria-label="Share"/);
    assert.match(button, /aria-label=\{label\}/);
    assert.match(button, /min-h-11/);
    assert.match(button, /h-11 w-11/);
    assert.match(button, /hit-44/);
    assert.match(read("lib/share/sheet.ts"), /name === "AbortError"/);
  });
});
