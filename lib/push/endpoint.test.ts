import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowedPushEndpoint, parseEndpointBody, parseSubscriptionBody } from "./endpoint";

const P256DH = "B".repeat(87);
const AUTH = "a".repeat(22);

describe("push endpoint allowlist", () => {
  it("accepts the real push services", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://web.push.apple.com/QGx1",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
      "https://jmt17.push.api.chromium.org/abc",
      "https://fcm.googleapis.com:443/fcm/send/x",
    ]) {
      assert.equal(isAllowedPushEndpoint(url), true, url);
    }
  });

  it("rejects http, IPs, localhost, other hosts and lookalikes", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://127.0.0.1/push",
      "https://[::1]/push",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/push",
      "https://example.com/push",
      "https://fcm.googleapis.com.evil.com/x",
      "https://evilfcm.googleapis.com.attacker.net/x",
      "https://notfcm.googleapis.co/x",
      "https://fakepush.apple.com.evil.io/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://fcm.googleapis.com./x",
      "ftp://fcm.googleapis.com/x",
      "javascript:alert(1)",
      "",
      `https://fcm.googleapis.com/${"a".repeat(1100)}`,
    ]) {
      assert.equal(isAllowedPushEndpoint(url), false, url);
    }
    assert.equal(isAllowedPushEndpoint(42), false);
  });

  it("parses a subscription body and checks its keys", () => {
    const body = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: P256DH, auth: AUTH },
      platform: "android",
    };
    assert.deepEqual(parseSubscriptionBody(body), {
      endpoint: body.endpoint,
      p256dh: P256DH,
      auth: AUTH,
      platform: "android",
    });
    assert.equal(parseSubscriptionBody({ ...body, platform: "toaster" })?.platform, "other");
    assert.equal(parseSubscriptionBody({ ...body, keys: { p256dh: "short", auth: AUTH } }), null);
    assert.equal(parseSubscriptionBody({ ...body, keys: { p256dh: P256DH, auth: "a b c d e f g h i j k" } }), null);
    assert.equal(parseSubscriptionBody({ ...body, endpoint: "https://evil.test/x" }), null);
    assert.equal(parseSubscriptionBody(null), null);
    assert.equal(parseEndpointBody({ endpoint: body.endpoint }), body.endpoint);
    assert.equal(parseEndpointBody({ endpoint: "http://fcm.googleapis.com/x" }), null);
  });
});
