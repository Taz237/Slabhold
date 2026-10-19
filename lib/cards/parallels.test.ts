import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { titleMatchesCard } from "@/lib/comps/match";
import { mailDayCardRecord, type PreparedMailDayCard } from "@/lib/social/mail-day";
import {
  GENERIC_PARALLELS,
  parallelAfterSetChange,
  parallelsForSet,
} from "./parallels";

describe("parallels by set", () => {
  it("shows Hyper for Prizm and not X-Fractor", () => {
    const options = parallelsForSet("Panini Prizm");
    assert.equal(options.includes("Hyper"), true);
    assert.equal(options.includes("X-Fractor"), false);
  });

  it("shows Superfractor for Topps Chrome and Bowman Chrome", () => {
    assert.equal(parallelsForSet("Topps Chrome").includes("Superfractor"), true);
    assert.equal(parallelsForSet("Bowman Chrome").includes("Superfractor"), true);
    assert.equal(parallelsForSet("Topps Chrome"), parallelsForSet("Bowman Chrome"));
  });

  it("uses the generic list for an unknown set", () => {
    assert.deepEqual([...parallelsForSet("Topps Now")], [...GENERIC_PARALLELS]);
    assert.deepEqual([...parallelsForSet("My Custom Set")], [...GENERIC_PARALLELS]);
    assert.equal(parallelsForSet("Topps Now").includes("Hyper"), false);
    assert.equal(parallelsForSet("Topps Now").includes("Cracked Ice"), true);
  });

  it("keeps a custom parallel and still matches a comps title", () => {
    const kept = parallelAfterSetChange({
      parallel: "Lazer",
      parallelIsCustom: true,
      setBrand: "Topps Now",
    });
    assert.equal(kept.parallel, "Lazer");
    assert.equal(kept.parallelIsCustom, true);
    assert.equal(kept.reset, false);

    const card: PreparedMailDayCard & { id: string } = {
      id: "card-1",
      playerName: "Victor Wembanyama",
      year: 2023,
      yearLabel: "2023-24",
      setBrand: "Panini Prizm",
      setIsCustom: false,
      cardNumber: "136",
      parallel: "Lazer",
      parallelIsCustom: true,
      sport: "Basketball",
      conditionType: "raw",
      grader: null,
      gradeValue: "Raw",
      gradeText: "Raw",
      paid: null,
      source: "ebay",
      category: "pc",
      isPublic: true,
      showPaid: false,
      photos: [],
    };
    const row = mailDayCardRecord("user-1", card, "2026-10-19", "2026-10-19T00:00:00.000Z");
    assert.equal(row.parallel, "Lazer");
    assert.equal(row.parallel_is_custom, true);

    assert.equal(
      titleMatchesCard("2023-24 Panini Prizm Victor Wembanyama #136 Lazer", {
        playerName: "Victor Wembanyama",
        year: 2023,
        yearLabel: "2023-24",
        setBrand: "Panini Prizm",
        cardNumber: "136",
        parallel: "Lazer",
        conditionType: "raw",
        grade: "Raw",
      }),
      true,
    );
    assert.equal(
      titleMatchesCard("2023-24 Panini Prizm Victor Wembanyama #136 Laser", {
        playerName: "Victor Wembanyama",
        year: 2023,
        yearLabel: "2023-24",
        setBrand: "Panini Prizm",
        cardNumber: "136",
        parallel: "Lazer",
        conditionType: "raw",
        grade: "Raw",
      }),
      true,
    );
  });

  it("resets a parallel the new set does not list", () => {
    const reset = parallelAfterSetChange({
      parallel: "Hyper",
      parallelIsCustom: false,
      setBrand: "Topps Chrome",
    });
    assert.equal(reset.parallel, "Base");
    assert.equal(reset.parallelIsCustom, false);
    assert.equal(reset.reset, true);
  });

  it("is the one list imported by Add Card and Mail Day", () => {
    const cardForm = readFileSync(join(process.cwd(), "components/card-form.tsx"), "utf8");
    const mailForm = readFileSync(join(process.cwd(), "components/mail-day-form.tsx"), "utf8");
    const options = readFileSync(join(process.cwd(), "lib/card-options.ts"), "utf8");
    assert.match(cardForm, /from "@\/lib\/cards\/parallels"/);
    assert.match(mailForm, /from "@\/lib\/cards\/parallels"/);
    assert.equal(options.includes("export const PARALLELS"), false);
  });
});