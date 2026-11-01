import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";
import { EMPTY_FOUNDER_SHOWCASE } from "@/lib/landing/founder";
import { founderFailure, welcomeFounderShowcase } from "@/lib/landing/founder-page";

const warned: unknown[][] = [];
const realWarn = console.warn;
beforeEach(() => {
  warned.length = 0;
  console.warn = (...args: unknown[]) => void warned.push(args);
});
afterEach(() => {
  console.warn = realWarn;
});

const error = new Error("boom");
const failing = () => Promise.reject(error);

describe("/welcome founder read outside production", () => {
  it("falls back to sample slabs under next dev and tests", () => {
    assert.equal(founderFailure(error, undefined, "development"), EMPTY_FOUNDER_SHOWCASE);
    assert.equal(founderFailure(error, undefined, "test"), EMPTY_FOUNDER_SHOWCASE);
    assert.equal(founderFailure(error, undefined, undefined), EMPTY_FOUNDER_SHOWCASE);
  });

  it("still throws in production at runtime", () => {
    assert.throws(() => founderFailure(error, PHASE_PRODUCTION_SERVER, "production"), /boom/);
    assert.throws(() => founderFailure(error, undefined, "production"), /boom/);
  });

  it("returns sample slabs during the build under any NODE_ENV", () => {
    for (const nodeEnv of ["production", "development", "test", undefined]) {
      assert.equal(founderFailure(error, PHASE_PRODUCTION_BUILD, nodeEnv), EMPTY_FOUNDER_SHOWCASE);
    }
  });

  it("keeps the [landing-founder] warn on the dev fallback", async () => {
    assert.deepEqual(await welcomeFounderShowcase(failing, undefined, "development"), EMPTY_FOUNDER_SHOWCASE);
    assert.equal(warned[0]?.[0], "[landing-founder]");
  });
});
