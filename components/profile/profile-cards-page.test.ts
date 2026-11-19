import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { profileCardsLinkFor } from "@/lib/leaderboard/profile-link";
import { missingCheckForPath } from "@/lib/social/missing-route";
import { routePattern } from "@/lib/analytics";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("/u/<handle>/cards: the full grid behind See all", () => {
  it("is a real route that 404s for an unknown collector", () => {
    const page = read("app/(app)/u/[username]/cards/page.tsx");
    assert.match(page, /await requireProfile\(name\);/);
    assert.match(page, /<ProfileCardsView username=\{name\} \/>/);
    // The proxy checks the handle too, and the card page under it keeps its own check.
    const matcher = read("proxy.ts").slice(read("proxy.ts").indexOf("matcher:"));
    assert.match(matcher, /"\/u\/:username\/cards",\s*"\/u\/:username\/cards\/:id",/);
    assert.deepEqual(missingCheckForPath("/u/maya/cards"), { kind: "profile", username: "maya" });
    assert.equal(routePattern("/u/maya/cards"), "/u/[username]/cards");
  });

  it("paints a skeleton of its own on the tap", () => {
    assert.match(read("app/(app)/u/[username]/cards/loading.tsx"), /<ProfileCardsSkeleton \/>/);
    const skeleton = read("components/profile/profile-cards-skeleton.tsx");
    assert.match(skeleton, /skeleton-shimmer/);
    assert.doesNotMatch(skeleton, /animate-spin/);
  });

  it("holds the old Cards tab as it was: hint, filter, grid with values, empty state, pull to refresh", () => {
    const view = read("components/profile/profile-cards-view.tsx");
    assert.match(view, /<PullToRefresh/);
    assert.match(view, /isOwn && cardsReady && collection\.length === 0 \? \(\s*<p className="mb-3 text-xs text-zinc-500">\s*Cards are private by default\./);
    assert.match(view, /<OpenToOffersFilter\s+available=\{offersAvailable\}\s+active=\{offersOnly\}/);
    assert.match(view, /useCardValues\(collectionIds\)/);
    assert.match(view, /<ProfileCardGrid cards=\{shownCollection\} username=\{profile\.username\} values=\{cardValues\} \/>/);
    assert.match(view, /"No public cards yet"/);
    assert.match(view, /Add a card/);
    // The header: back to the profile, the avatar, whose cards these are, and the count in mono.
    assert.match(view, /goBack\(\{ to: backHref, push: \(href\) => router\.push\(href\) \}\)/);
    assert.match(view, /aria-label="Back to profile"/);
    assert.match(view, /@\{profile\.username\}&apos;s cards/);
    assert.match(view, /font-mono text-13 text-zinc-500 tabular-nums/);
    // Never a private card: the list is the shared hook's, which reads public_cards.
    assert.match(view, /useProfileCards\(profile\)/);
    assert.doesNotMatch(view, /from\("cards"\)/);
  });

  it("only ever lists public cards, for the owner and for everyone else", () => {
    const hook = read("components/profile/use-profile-cards.ts");
    assert.match(hook, /loadProfilePublicCards\(supabase, ownerId\)/);
    // Your own book fills in public cards only.
    assert.match(hook, /\.filter\(\(card\) => card\.isPublic\)/);
    assert.match(hook, /return profileCardsTab\(\{/);
    assert.doesNotMatch(hook, /from\("cards"\)/);
  });

  it("is where the leaderboard's card links go", () => {
    assert.equal(profileCardsLinkFor({ subtitle: "@maya", href: "/u/maya" }), "/u/maya/cards");
  });
});
