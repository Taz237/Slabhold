import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const MANIFEST = "ios-app/ios/App/App/PrivacyInfo.xcprivacy";

type Plist = boolean | string | Plist[] | { [key: string]: Plist };

/** A small XML plist reader: dict, array, string, true, false. Throws on anything else. */
function parsePlist(xml: string): Plist {
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<!DOCTYPE plist PUBLIC "-\/\/Apple\/\/DTD PLIST 1\.0\/\/EN" "http:\/\/www\.apple\.com\/DTDs\/PropertyList-1\.0\.dtd">\s*<plist version="1\.0">/);
  const tokens = [...xml.replace(/^[\s\S]*?<plist version="1\.0">/, "").replace(/<\/plist>\s*$/, "").matchAll(/<(\/?)(\w+)(\/?)>([^<]*)/g)];
  let index = 0;
  function value(): Plist {
    const token = tokens[index++];
    assert.ok(token, "unexpected end");
    const [, close, tag, selfClosing, text] = token;
    assert.equal(close, "", `unexpected </${tag}>`);
    if (tag === "true" || tag === "false") {
      assert.equal(selfClosing, "/", tag);
      return tag === "true";
    }
    if (selfClosing === "/") {
      if (tag === "array") return [];
      if (tag === "dict") return {};
      throw new Error(`unexpected <${tag}/>`);
    }
    if (tag === "string") {
      const end = tokens[index++];
      assert.ok(end && end[1] === "/" && end[2] === "string", "string not closed");
      return text!;
    }
    if (tag === "array") {
      const items: Plist[] = [];
      while (!(tokens[index]![1] === "/" && tokens[index]![2] === "array")) items.push(value());
      index += 1;
      return items;
    }
    if (tag === "dict") {
      const dict: { [key: string]: Plist } = {};
      while (!(tokens[index]![1] === "/" && tokens[index]![2] === "dict")) {
        const key = tokens[index++]!;
        assert.equal(key[2], "key", "dict entries start with <key>");
        const end = tokens[index++]!;
        assert.ok(end[1] === "/" && end[2] === "key");
        assert.ok(!(key[4]! in dict), `duplicate key ${key[4]}`);
        dict[key[4]!] = value();
      }
      index += 1;
      return dict;
    }
    throw new Error(`unexpected <${tag}>`);
  }
  const result = value();
  assert.equal(index, tokens.length, "trailing content");
  return result;
}

const manifest = parsePlist(read(MANIFEST)) as Record<string, Plist>;
type Collected = {
  NSPrivacyCollectedDataType: string;
  NSPrivacyCollectedDataTypeLinked: boolean;
  NSPrivacyCollectedDataTypeTracking: boolean;
  NSPrivacyCollectedDataTypePurposes: string[];
};
const collected = manifest.NSPrivacyCollectedDataTypes as unknown as Collected[];
const byType = new Map(collected.map((entry) => [entry.NSPrivacyCollectedDataType, entry]));

describe("App Store privacy manifest", () => {
  it("is valid plist XML with no tracking", () => {
    assert.equal(manifest.NSPrivacyTracking, false);
    assert.deepEqual(manifest.NSPrivacyTrackingDomains, []);
  });

  it("declares no required-reason APIs: neither the app nor its plugins call any", () => {
    assert.deepEqual(manifest.NSPrivacyAccessedAPITypes, []);
  });

  const linked = [
    "NSPrivacyCollectedDataTypeEmailAddress",
    "NSPrivacyCollectedDataTypeName",
    "NSPrivacyCollectedDataTypeUserID",
    "NSPrivacyCollectedDataTypeOtherUserContent",
    "NSPrivacyCollectedDataTypePhotosorVideos",
  ];
  for (const type of linked) {
    it(`collects ${type.replace("NSPrivacyCollectedDataType", "")}: linked, not tracking, for app functionality`, () => {
      assert.deepEqual(byType.get(type), {
        NSPrivacyCollectedDataType: type,
        NSPrivacyCollectedDataTypeLinked: true,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"],
      });
    });
  }

  for (const [type, purpose] of [
    ["NSPrivacyCollectedDataTypeProductInteraction", "NSPrivacyCollectedDataTypePurposeAnalytics"],
    ["NSPrivacyCollectedDataTypePerformanceData", "NSPrivacyCollectedDataTypePurposeAppFunctionality"],
  ] as const) {
    it(`collects ${type.replace("NSPrivacyCollectedDataType", "")}: not linked, not tracking`, () => {
      assert.deepEqual(byType.get(type), {
        NSPrivacyCollectedDataType: type,
        NSPrivacyCollectedDataTypeLinked: false,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: [purpose],
      });
    });
  }

  it("declares nothing else", () => {
    assert.equal(collected.length, 7);
  });

  it("ships in the App target's Resources", () => {
    const pbx = read("ios-app/ios/App/App.xcodeproj/project.pbxproj");
    assert.match(pbx, /\/\* PrivacyInfo\.xcprivacy in Resources \*\/ = \{isa = PBXBuildFile; fileRef = (\w+) \/\* PrivacyInfo\.xcprivacy \*\/; \};/);
    assert.match(pbx, /\/\* PrivacyInfo\.xcprivacy \*\/ = \{isa = PBXFileReference; lastKnownFileType = text\.xml; path = PrivacyInfo\.xcprivacy; sourceTree = "<group>"; \};/);
    const resources = pbx.slice(pbx.indexOf("/* Begin PBXResourcesBuildPhase section */"), pbx.indexOf("/* End PBXResourcesBuildPhase section */"));
    assert.match(resources, /PrivacyInfo\.xcprivacy in Resources/);
    const group = pbx.slice(pbx.indexOf("504EC3061FED79650016851F /* App */ = {"));
    assert.match(group.slice(0, group.indexOf("};")), /PrivacyInfo\.xcprivacy \*\//);
  });
});
