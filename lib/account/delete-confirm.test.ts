import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDeleteConfirmation } from "@/lib/account/delete-confirm";

describe("isDeleteConfirmation", () => {
  it("accepts DELETE in any case, with spaces around it", () => {
    for (const typed of ["DELETE", "delete", "Delete", "  DELETE ", "Delete\n"]) {
      assert.equal(isDeleteConfirmation(typed), true, typed);
    }
  });

  it("rejects anything else", () => {
    for (const typed of ["", "DELET", "DELETE ME", "D E L E T E", "deleted"]) {
      assert.equal(isDeleteConfirmation(typed), false, typed);
    }
  });
});
