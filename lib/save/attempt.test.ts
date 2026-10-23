import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OFFLINE_SAVE_MESSAGE,
  SAVE_TIMEOUT_MESSAGE,
  SAVE_TIMEOUT_MS,
  claimSubmit,
  isSaveTimeout,
  saveFailureText,
  withSaveTimeout,
} from "./attempt";

describe("save attempts", () => {
  it("uses a deadline inside the 20–30 second window", () => {
    assert.equal(SAVE_TIMEOUT_MS, 25_000);
    assert.equal(SAVE_TIMEOUT_MESSAGE, "We couldn't confirm the save. Retry is safe.");
  });

  it("returns a fast success and leaves a real error alone", async () => {
    assert.equal(await withSaveTimeout(async () => "saved", 25_000), "saved");
    await assert.rejects(
      withSaveTimeout(async () => {
        throw new Error("Could not upload that photo.");
      }, 25_000),
      /Could not upload that photo/,
    );
  });

  it("rejects a hung save at the deadline and aborts the signal", async () => {
    const started = Date.now();
    let aborted = false;
    await assert.rejects(
      withSaveTimeout((signal) => {
        signal.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise(() => undefined);
      }, 40),
      (error: unknown) => {
        assert.equal(isSaveTimeout(error), true);
        assert.equal((error as Error).message, SAVE_TIMEOUT_MESSAGE);
        return true;
      },
    );
    const elapsed = Date.now() - started;
    assert.equal(aborted, true);
    assert.ok(elapsed >= 30 && elapsed < 1_000);
  });

  it("replaces a dropped fetch with a retry message and leaves other errors", () => {
    assert.equal(saveFailureText(new TypeError("Failed to fetch")), OFFLINE_SAVE_MESSAGE);
    assert.equal(saveFailureText(new Error("TypeError: Failed to fetch")), OFFLINE_SAVE_MESSAGE);
    assert.equal(saveFailureText(new Error("Card not found.")), "Card not found.");
    assert.equal(saveFailureText(new Error("Could not save this card.")), "Could not save this card.");
    assert.equal(OFFLINE_SAVE_MESSAGE, "Couldn't save. Check your connection and tap Retry.");
  });

  it("ignores a second submit while the first is still held", () => {
    const held = { current: false };
    assert.equal(claimSubmit(held), true);
    assert.equal(claimSubmit(held), false);
    held.current = false;
    assert.equal(claimSubmit(held), true);
  });
});
