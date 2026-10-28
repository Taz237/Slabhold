import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { cardCategory, categoryLabel } from "./card-category";
import { SPORT_PICKER_OPTIONS, SPORTS, optionsWithCurrent } from "./card-options";
import { BRAND_PURPLE, webAppManifest } from "./pwa/manifest";
import {
  MAIL_DAY_SPORT_PICKER,
  MAIL_DAY_SPORTS,
  isMailDaySport,
  mailDaySportLabel,
} from "./social/mail-day";
import { missingDetailFields, needsDetails, needsDetailsLabel } from "./types";
import { wantChipLabel } from "./wants/label";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function pngSize(path: string) {
  const bytes = readFileSync(join(process.cwd(), path));
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const complete = {
  cardNumber: "47",
  noNumber: false,
  conditionType: "raw" as const,
  grade: "Raw",
  year: 2020,
  yearLabel: "2020",
  setBrand: "Prizm",
};

describe("label mapping", () => {
  it("shows Personal and Flipping while storing pc and flipping", () => {
    assert.equal(categoryLabel("pc"), "Personal");
    assert.equal(categoryLabel("flipping"), "Flipping");
    assert.equal(cardCategory({ category: "pc" }), "pc");
    assert.equal(cardCategory({ category: "flipping" }), "flipping");
    assert.equal(cardCategory({ category: null }), "flipping");

    const picker = read("components/category-picker.tsx");
    const dashboard = read("components/dashboard.tsx");
    assert.match(picker, /categoryLabel\(option\.id\)/);
    assert.match(picker, /id: "pc"/);
    assert.match(dashboard, /categoryLabel\("pc"\)/);
    assert.doesNotMatch(picker, /label: "PC"/);
    assert.doesNotMatch(dashboard, /label: "PC"/);
  });

  it("names a saved want on a shared card and leaves the stored row alone", () => {
    assert.equal(
      wantChipLabel({ saved: false, ownerHandle: "maya", viewerHandle: "ada" }),
      "Add to want list",
    );
    assert.equal(
      wantChipLabel({ saved: true, ownerHandle: "ada", viewerHandle: "ada" }),
      "On your want list",
    );
    assert.equal(
      wantChipLabel({ saved: true, ownerHandle: "@maya", viewerHandle: "ada" }),
      "On @maya's want list",
    );
    assert.equal(wantChipLabel({ saved: true, viewerHandle: "ada" }), "On your want list");

    const button = read("components/want-button.tsx");
    assert.match(button, /wantChipLabel\(/);
    assert.match(button, /ownerHandle: user\?\.username/);
    assert.match(button, /viewerHandle: user\?\.username/);
    assert.doesNotMatch(button, /shared \? user/);
    assert.doesNotMatch(button, />\s*Want\s*</);
  });

  it("lists the missing fields instead of a bare Needs details chip", () => {
    assert.deepEqual(
      missingDetailFields({ ...complete, year: 0, yearLabel: "", setBrand: "" }),
      ["year", "set"],
    );
    assert.equal(
      needsDetailsLabel({ ...complete, year: 0, yearLabel: "", setBrand: "" }),
      "Needs: year, set",
    );
    assert.equal(needsDetails({ ...complete, cardNumber: "", grade: "PSA" }), true);
    assert.equal(
      needsDetailsLabel({ ...complete, cardNumber: "", conditionType: "graded", grade: "PSA" }),
      "Needs: number, grade",
    );
    assert.equal(needsDetails(complete), false);
    assert.equal(needsDetails({ ...complete, noNumber: true, cardNumber: "" }), false);

    // Collection tiles show a small amber dot named by the label.
    const grid = read("components/collection-grid.tsx");
    assert.match(grid, /needsDetailsLabel=\{needsDetails\(card\) \? needsDetailsLabel\(card\) : null\}/);
    assert.doesNotMatch(grid, /Needs details/);
    const tile = read("components/card-tile.tsx");
    assert.match(tile, /aria-label=\{needsDetailsLabel\}/);
    assert.doesNotMatch(tile, /Needs details/);
  });
});

describe("sport picker", () => {
  it("drops Pokémon from the launch pickers and still renders a stored value", () => {
    assert.equal(SPORT_PICKER_OPTIONS.includes("Pokémon"), false);
    assert.equal(MAIL_DAY_SPORT_PICKER.includes("Pokémon"), false);
    assert.equal(SPORTS.includes("Pokémon"), true);
    assert.equal((MAIL_DAY_SPORTS as readonly string[]).includes("Pokémon"), true);
    assert.equal(isMailDaySport("Pokémon"), true);

    const addCard = optionsWithCurrent(SPORT_PICKER_OPTIONS, "Pokémon");
    assert.equal(addCard[0], "Pokémon");
    assert.equal(addCard.includes("Basketball"), true);
    assert.equal(addCard.filter((sport) => sport === "Pokémon").length, 1);

    const mailDay = optionsWithCurrent([...MAIL_DAY_SPORT_PICKER], "Pokémon");
    assert.equal(mailDay.includes("Pokémon"), true);
    assert.match(mailDaySportLabel("Pokémon"), /Pokémon/);
    assert.equal(mailDaySportLabel("Basketball"), "Basketball");

    const other = optionsWithCurrent(SPORT_PICKER_OPTIONS, "Cricket");
    assert.equal(other[0], "Cricket");
    assert.equal(mailDaySportLabel("Cricket"), "Cricket");
    assert.equal(optionsWithCurrent(SPORT_PICKER_OPTIONS, "Basketball").includes("Pokémon"), false);

    const form = read("components/card-form.tsx");
    const mail = read("components/mail-day-form.tsx");
    assert.match(form, /optionsWithCurrent\(SPORT_PICKER_OPTIONS, form\.sport\)/);
    assert.match(mail, /optionsWithCurrent\(\[\.\.\.MAIL_DAY_SPORT_PICKER\], section\.sport\)/);
    assert.match(mail, /mailDaySportLabel\(sport\)/);
    assert.doesNotMatch(form, /\bSPORTS\b/);
  });
});

describe("manifest", () => {
  it("describes an installable Slabhold app with brand icons", () => {
    assert.equal(webAppManifest.name, "Slabhold");
    assert.equal(webAppManifest.short_name, "Slabhold");
    assert.equal(webAppManifest.start_url, "/");
    assert.equal(webAppManifest.display, "standalone");
    assert.equal(webAppManifest.background_color, BRAND_PURPLE);
    assert.equal(webAppManifest.theme_color, BRAND_PURPLE);
    assert.equal(BRAND_PURPLE, "#7C3AED");

    const icons = webAppManifest.icons;
    assert.equal(icons.some((icon) => icon.sizes === "192x192"), true);
    assert.equal(icons.some((icon) => icon.sizes === "512x512" && icon.purpose !== "maskable"), true);
    assert.equal(icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512"), true);

    assert.deepEqual(pngSize("public/icons/icon-192.png"), { width: 192, height: 192 });
    assert.deepEqual(pngSize("public/icons/icon-512.png"), { width: 512, height: 512 });
    assert.deepEqual(pngSize("public/icons/icon-maskable.png"), { width: 512, height: 512 });
    assert.deepEqual(pngSize("public/apple-touch-icon.png"), { width: 180, height: 180 });

    const manifest = read("app/manifest.ts");
    assert.match(manifest, /webAppManifest/);
    const layout = read("app/layout.tsx");
    assert.match(layout, /metadataBase: new URL\(SITE_URL\)/);
    assert.match(layout, /canonical: "\.\/"/);
    assert.doesNotMatch(layout, /metadataBaseUrl/);
    assert.doesNotMatch(layout, /apple-mobile-web-app-capable/);
    assert.match(layout, /viewportFit: "cover"/);
    assert.match(layout, /themeColor: BRAND_PURPLE/);
    assert.match(layout, /capable: true/);
    assert.match(layout, /statusBarStyle: "black-translucent"/);
    assert.match(layout, /\/apple-touch-icon\.png/);
    assert.match(layout, /sizes: "180x180"/);

    const shell = read("components/app-shell.tsx");
    assert.match(read("lib/ui/bottom-nav.ts"), /label: "Home"/);
    assert.match(shell, /BOTTOM_NAV/);
    assert.match(shell, /env\(safe-area-inset-bottom\)/);
    assert.match(shell, /env\(safe-area-inset-top\)/);
    const css = read("app/globals.css");
    assert.match(css, /font-size: 16px/);
    assert.match(css, /min-height: 44px/);
    assert.match(css, /\.hit-44::after/);
    assert.match(
      read("components/profile-edit-sheet.tsx"),
      /mx-auto flex h-full w-full max-w-lg flex-col bg-\[var\(--background\)\] pt-\[env\(safe-area-inset-top\)\]/,
    );
    assert.match(
      read("components/message-thread.tsx"),
      /h-\[calc\(100dvh-3\.5rem-6\.15rem-env\(safe-area-inset-top\)-env\(safe-area-inset-bottom\)\)\]/,
    );
  });
});

describe("auth pages", () => {
  it("does not poll on an interval of our own", () => {
    for (const path of [
      "app/login/page.tsx",
      "app/signup/page.tsx",
      "app/forgot-password/page.tsx",
      "components/auth-form.tsx",
      "components/forgot-password-form.tsx",
      "components/captcha.tsx",
    ]) {
      assert.doesNotMatch(read(path), /setInterval/);
    }
  });
});
