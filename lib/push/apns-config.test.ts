import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { apnsConfig, apnsConfigProblems, normalizePem } from "./apns-config";

/** A throwaway P-256 key made for this test run. Never a real key. */
function testPem(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return privateKey.export({ format: "pem", type: "pkcs8" }).toString();
}

const pem = testPem();
const full = { APNS_KEY_ID: "ABC123DEFG", APNS_TEAM_ID: "TEAM000000", APNS_BUNDLE_ID: "app.example", APNS_PRIVATE_KEY: pem };

describe("apnsConfig", () => {
  it("reads all four values", () => {
    const config = apnsConfig(full);
    assert.ok(config);
    assert.equal(config.keyId, "ABC123DEFG");
    assert.equal(config.teamId, "TEAM000000");
    assert.equal(config.bundleId, "app.example");
    assert.equal(config.privateKey.asymmetricKeyType, "ec");
  });

  for (const name of Object.keys(full) as (keyof typeof full)[]) {
    it(`is off when ${name} is missing or blank`, () => {
      assert.equal(apnsConfig({ ...full, [name]: undefined }), null);
      assert.equal(apnsConfig({ ...full, [name]: "   " }), null);
    });
  }

  it("is off with no env at all", () => {
    assert.equal(apnsConfig({}), null);
  });

  it("is off when the key doesn't parse", () => {
    assert.equal(apnsConfig({ ...full, APNS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----" }), null);
    assert.equal(apnsConfig({ ...full, APNS_PRIVATE_KEY: "not a key" }), null);
  });

  it("is off for a non-EC key", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    assert.equal(apnsConfig({ ...full, APNS_PRIVATE_KEY: privateKey.export({ format: "pem", type: "pkcs8" }).toString() }), null);
  });

  it('accepts the PEM on one line with literal "\\n", and with quotes', () => {
    const oneLine = pem.trim().replace(/\n/g, "\\n");
    assert.ok(!oneLine.includes("\n"));
    assert.ok(apnsConfig({ ...full, APNS_PRIVATE_KEY: oneLine }));
    assert.ok(apnsConfig({ ...full, APNS_PRIVATE_KEY: `"${oneLine}"` }));
    assert.ok(apnsConfig({ ...full, APNS_PRIVATE_KEY: pem.replace(/\n/g, "\r\n") }));
    assert.equal(normalizePem("a\\nb\\r\\nc"), "a\nb\nc");
  });

  it("names what's wrong, by setting name only, never a value", () => {
    assert.deepEqual(apnsConfigProblems(full), []);
    assert.deepEqual(apnsConfigProblems({}), [
      "APNS_KEY_ID missing",
      "APNS_TEAM_ID missing",
      "APNS_BUNDLE_ID missing",
      "APNS_PRIVATE_KEY missing",
    ]);
    assert.deepEqual(apnsConfigProblems({ ...full, APNS_TEAM_ID: "  " }), ["APNS_TEAM_ID missing"]);
    const bad = apnsConfigProblems({ ...full, APNS_PRIVATE_KEY: "not a key SECRETVALUE" });
    assert.deepEqual(bad, ["APNS_PRIVATE_KEY is not a valid .p8 key"]);
    const { privateKey } = generateKeyPairSync("ed25519");
    const wrongType = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    assert.deepEqual(apnsConfigProblems({ ...full, APNS_PRIVATE_KEY: wrongType }), ["APNS_PRIVATE_KEY is not a valid .p8 key"]);
    assert.equal(JSON.stringify([bad, apnsConfigProblems({ ...full, APNS_KEY_ID: undefined })]).includes("SECRETVALUE"), false);
    assert.equal(JSON.stringify(apnsConfigProblems({ ...full, APNS_KEY_ID: undefined })).includes(pem.slice(30, 60)), false);
  });
});
