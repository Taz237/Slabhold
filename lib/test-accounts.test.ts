import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isTestAccount,
  KEPT_ACCOUNT_HANDLES,
  normalizeAccountHandle,
  TEST_ACCOUNT_HANDLES,
  TEST_ACCOUNT_PREFIXES,
} from "./test-accounts";

describe("isTestAccount", () => {
  it("matches qa_, qa-, test_, and vreset_ prefixes", () => {
    assert.equal(isTestAccount("qa_alpha"), true);
    assert.equal(isTestAccount("QA_Alpha"), true);
    assert.equal(isTestAccount("@qa_alpha"), true);
    assert.equal(isTestAccount("  qa_alpha  "), true);
    assert.equal(isTestAccount("qa-bot"), true);
    assert.equal(isTestAccount("QA-Bot"), true);
    assert.equal(isTestAccount("test_user"), true);
    assert.equal(isTestAccount("@test_user"), true);
    assert.equal(isTestAccount("vreset_1021"), true);
    assert.equal(isTestAccount("@vreset_1021"), true);
    assert.equal(isTestAccount("Vreset_Bot"), true);
  });

  it("includes the explicit qa_vreset_1021 handle", () => {
    assert.ok(TEST_ACCOUNT_HANDLES.includes("qa_vreset_1021"));
    assert.equal(isTestAccount("qa_vreset_1021"), true);
    assert.equal(isTestAccount("@QA_VRESET_1021"), true);
  });

  it("leaves real collectors and the official accounts alone", () => {
    assert.equal(isTestAccount("slabhold"), false);
    assert.equal(isTestAccount("@slabhold"), false);
    assert.equal(isTestAccount("grokbotreview"), false);
    assert.equal(isTestAccount("@GrokBotReview"), false);
    assert.ok(KEPT_ACCOUNT_HANDLES.includes("slabhold"));
    assert.ok(KEPT_ACCOUNT_HANDLES.includes("grokbotreview"));
    assert.equal(isTestAccount("waxroom"), false);
    assert.equal(isTestAccount("qualitycards"), false);
    assert.equal(isTestAccount("qatest"), false);
    assert.equal(isTestAccount("testuser"), false);
    assert.equal(isTestAccount("contest_winner"), false);
    assert.equal(isTestAccount("myvreset"), false);
    assert.equal(isTestAccount("vreset"), false);
    assert.equal(isTestAccount("vresetti"), false);
    assert.equal(isTestAccount("VresetBot"), false);
    assert.equal(isTestAccount(""), false);
    assert.equal(isTestAccount("@"), false);
    assert.equal(isTestAccount("   "), false);
  });

  it("keeps the prefix list easy to extend", () => {
    assert.deepEqual(TEST_ACCOUNT_PREFIXES, ["qa_", "qa-", "test_", "vreset_"]);
    assert.equal(normalizeAccountHandle("  @Handle  "), "handle");
  });
});
