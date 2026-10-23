import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { filterOpenToOffers } from "@/lib/offers/open-to-offers";
import { localDeletePost, localPinPost, localUnpinPost, type LocalDb } from "./local-db";
import {
  decidePin,
  decideUnpin,
  pinnedPostIdAfterDelete,
  postHasProfileMedia,
  profileCardsTab,
  profileMediaItems,
  profileReplies,
  profileTabFromQuery,
  profileWithPin,
  withPinnedFirst,
  type ProfileTabCard,
} from "./profile-tabs";
import { remotePinPost, remoteUnpinPost } from "./remote";
import type { TimelineItem } from "./timeline";
import type { Post, PostComment, Profile } from "./types";

const ME = "me";
const OTHER = "other";

function person(id: string, pinnedPostId: string | null = null): Profile {
  return {
    id,
    email: "",
    username: id,
    displayName: id,
    bio: "",
    avatarDataUrl: null,
    coverDataUrl: null,
    accent: "#7c5cff",
    createdAt: "2026-10-22T00:00:00.000Z",
    pinnedPostId,
  };
}

function post(id: string, authorId: string, extra: Partial<Post> = {}): Post {
  return {
    id,
    authorId,
    body: id,
    imageDataUrl: null,
    card: null,
    quotedPostId: null,
    createdAt: `2026-10-22T00:00:0${id.length}.000Z`,
    ...extra,
  };
}

function item(value: Post, repostedBy: Profile | null = null): TimelineItem {
  return {
    key: repostedBy ? `repost:${repostedBy.id}:${value.id}` : `post:${value.id}`,
    post: value,
    at: value.createdAt,
    repostedBy,
  };
}

function comment(id: string, authorId: string, createdAt: string): PostComment {
  return { id, postId: "parent", authorId, body: `reply ${id}`, createdAt };
}

function db(over: Partial<LocalDb> = {}): LocalDb {
  return {
    users: [{ ...person(ME), passwordHash: "x" }],
    sessionUserId: ME,
    follows: [],
    posts: [post("p1", ME), post("p2", ME), post("px", OTHER)],
    likes: [],
    reposts: [],
    comments: [],
    notifications: [],
    messages: [],
    collections: {},
    ...over,
  };
}

function card(id: string, extra: Partial<ProfileTabCard> = {}): ProfileTabCard {
  return {
    id,
    playerName: id,
    year: 2024,
    setBrand: "Prizm",
    cardNumber: id,
    sport: "Basketball",
    photoDataUrl: null,
    accent: "#7c5cff",
    estimatedSellPrice: 10,
    ownerId: ME,
    ...extra,
  };
}

describe("pin and unpin rules", () => {
  it("pins only your own post and replaces the previous pin", () => {
    const own = decidePin({
      actorId: ME,
      profileId: ME,
      post: { id: "p1", authorId: ME },
    });
    assert.equal(own.ok, true);
    if (!own.ok) return;
    assert.equal(own.pinnedPostId, "p1");

    const foreign = decidePin({
      actorId: ME,
      profileId: ME,
      post: { id: "px", authorId: OTHER },
    });
    assert.deepEqual(foreign, { ok: false, error: "You can only pin your own post." });

    const signedOut = decidePin({
      actorId: null,
      profileId: ME,
      post: { id: "p1", authorId: ME },
    });
    assert.equal(signedOut.ok, false);

    const gone = decidePin({
      actorId: ME,
      profileId: ME,
      post: null,
    });
    assert.equal(gone.ok, false);

    const first = localPinPost(db(), "p1");
    assert.equal(first.error, undefined);
    assert.equal(first.db.users[0]?.pinnedPostId, "p1");
    const second = localPinPost(first.db, "p2");
    assert.equal(second.db.users[0]?.pinnedPostId, "p2");
    assert.equal(localPinPost(second.db, "px").error, "You can only pin your own post.");
    assert.equal(localPinPost(second.db, "px").db.users[0]?.pinnedPostId, "p2");

    const cleared = localUnpinPost(second.db);
    assert.equal(cleared.db.users[0]?.pinnedPostId, null);
    assert.equal(decideUnpin(null, ME).ok, false);
    assert.equal(decideUnpin(OTHER, ME).ok, false);
    assert.equal(
      localUnpinPost({ ...cleared.db, sessionUserId: null }).error,
      "You can only unpin your own profile.",
    );
  });

  it("calls the pin RPCs and does not write the column from the client", async () => {
    const calls: { name: string; args?: unknown }[] = [];
    const supabase = {
      rpc(name: string, args?: unknown) {
        calls.push({ name, args });
        return Promise.resolve({ error: null });
      },
      from() {
        throw new Error("pin must not update profiles from the client");
      },
    } as unknown as SupabaseClient;

    assert.equal((await remotePinPost(supabase, "p1")).error, undefined);
    assert.equal((await remoteUnpinPost(supabase)).error, undefined);
    assert.deepEqual(calls, [
      { name: "pin_post", args: { post_id: "p1" } },
      { name: "unpin_post", args: undefined },
    ]);

    const denied = {
      rpc() {
        return Promise.resolve({ error: { message: "can only pin your own post" } });
      },
    } as unknown as SupabaseClient;
    assert.equal((await remotePinPost(denied, "px")).error, "You can only pin your own post.");
  });

  it("clears the pin when that post is deleted and keeps a different pin", () => {
    assert.equal(pinnedPostIdAfterDelete("p1", "p1"), null);
    assert.equal(pinnedPostIdAfterDelete("p2", "p1"), "p2");
    assert.equal(pinnedPostIdAfterDelete(null, "p1"), null);

    const pinned = localPinPost(db(), "p1");
    const removed = localDeletePost(pinned.db, "p1");
    assert.equal(removed.error, undefined);
    assert.equal(removed.db.posts.some((item) => item.id === "p1"), false);
    assert.equal(removed.db.users[0]?.pinnedPostId, null);

    const otherPin = localPinPost(db(), "p2");
    const removedOther = localDeletePost(otherPin.db, "p1");
    assert.equal(removedOther.db.users[0]?.pinnedPostId, "p2");
  });
});

describe("profile tab filters", () => {
  const me = person(ME);
  const photo = post("photo", ME, { imageDataUrl: "https://example.test/a.jpg", images: ["https://example.test/a.jpg"] });
  const text = post("text", ME);
  const replyPhoto = post("theirs", OTHER, { imageDataUrl: "https://example.test/b.jpg" });
  const items = [
    item(text),
    item(photo),
    item(replyPhoto, me),
  ];

  it("keeps posts, replies, photos, and the older collection link apart", () => {
    assert.equal(profileTabFromQuery(null), "posts");
    assert.equal(profileTabFromQuery("posts"), "posts");
    assert.equal(profileTabFromQuery("replies"), "replies");
    assert.equal(profileTabFromQuery("media"), "media");
    assert.equal(profileTabFromQuery("cards"), "cards");
    assert.equal(profileTabFromQuery("collection"), "cards");

    const replies = profileReplies(
      [
        comment("c1", ME, "2026-10-22T00:00:01.000Z"),
        comment("c2", OTHER, "2026-10-22T00:00:03.000Z"),
        comment("c3", ME, "2026-10-22T00:00:02.000Z"),
      ],
      ME,
    );
    assert.deepEqual(replies.map((reply) => reply.id), ["c3", "c1"]);
    assert.equal(postHasProfileMedia(photo), true);
    assert.equal(postHasProfileMedia(text), false);

    const media = profileMediaItems(items, ME);
    assert.deepEqual(media.map((entry) => entry.post.id), ["photo"]);

    const pinned = withPinnedFirst(items, photo, me);
    assert.equal(pinned[0]?.key, "pinned:photo");
    assert.equal(pinned[0]?.post.id, "photo");
    assert.deepEqual(
      pinned.slice(1).map((entry) => entry.post.id),
      ["text", "theirs"],
    );
    assert.equal(pinned.filter((entry) => entry.post.id === "photo").length, 1);
    assert.equal(withPinnedFirst(items, replyPhoto, me).some((entry) => entry.key.startsWith("pinned:")), false);
  });

  it("replacing a pin moves the new post to the front", () => {
    const replaced = profileWithPin([person(ME, "text")], ME, "photo");
    assert.equal(replaced[0]?.pinnedPostId, "photo");
    const shown = withPinnedFirst(items, photo, replaced[0] ?? null);
    assert.equal(shown[0]?.post.id, "photo");
    assert.equal(shown.filter((entry) => entry.post.id === "photo").length, 1);
  });
});

describe("Cards tab privacy", () => {
  it("shows public_cards rows and never a private card to someone else", () => {
    const visible = profileCardsTab({
      ownerId: ME,
      viewerId: OTHER,
      publicCards: [
        card("public"),
        card("private-row", { isPublic: false, playerName: "Secret", cardNumber: "s" }),
        card("theirs", { ownerId: OTHER, playerName: "Other", cardNumber: "o" }),
      ],
      ownBook: [
        card("book-private", { isPublic: false, playerName: "Book", cardNumber: "b" }),
        card("book-public", { isPublic: true, playerName: "Shown", cardNumber: "p" }),
      ],
    });
    assert.deepEqual(visible.map((entry) => entry.id), ["public"]);

    const owner = profileCardsTab({
      ownerId: ME,
      viewerId: ME,
      publicCards: [card("public")],
      ownBook: [
        card("book-private", { isPublic: false, playerName: "Book", cardNumber: "b" }),
        card("book-public", { isPublic: true, playerName: "Shown", cardNumber: "p" }),
      ],
    });
    assert.deepEqual(owner.map((entry) => entry.id), ["public", "book-public"]);

    const offers = filterOpenToOffers(
      owner.map((entry) => ({ ...entry, openToOffers: entry.id === "book-public" })),
      true,
    );
    assert.deepEqual(offers.map((entry) => entry.id), ["book-public"]);
  });
});

describe("profile pin migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261022240000_profile_pinned_post.sql"),
    "utf8",
  );
  const verify = readFileSync(join(process.cwd(), "scripts/verify-profile-pin.sql"), "utf8");
  const username = readFileSync(
    join(process.cwd(), "supabase/migrations/20261022223000_reserve_profile_usernames.sql"),
    "utf8",
  );

  it("adds the nullable pin, blocks foreign pins, and leaves the username trigger", () => {
    assert.match(sql, /^begin;/m);
    assert.match(sql, /set local lock_timeout = '5s';/);
    assert.match(sql, /^commit;/m);
    assert.match(sql, /add column if not exists pinned_post_id uuid/);
    assert.match(
      sql,
      /foreign key \(pinned_post_id\)\s+references public\.posts \(id\)\s+on delete set null/i,
    );
    assert.match(sql, /before insert or update of pinned_post_id on public\.profiles/);
    assert.match(sql, /public\.posts\.user_id = new\.id/);
    assert.match(sql, /create or replace function public\.pin_post\(post_id uuid\)/);
    assert.match(sql, /create or replace function public\.unpin_post\(\)/);
    assert.match(sql, /security definer/);
    assert.match(sql, /set search_path = ''/);
    assert.match(sql, /revoke all on function public\.pin_post\(uuid\) from public, anon, authenticated/);
    assert.match(sql, /revoke all on function public\.unpin_post\(\) from public, anon, authenticated/);
    assert.match(sql, /grant execute on function public\.pin_post\(uuid\) to authenticated/);
    assert.match(sql, /grant execute on function public\.unpin_post\(\) to authenticated/);
    assert.doesNotMatch(sql, /grant execute on function public\.pin_post\(uuid\) to anon/);
    assert.doesNotMatch(sql, /grant execute on function public\.unpin_post\(\) to anon/);
    assert.match(sql, /profiles_reserve_username must stay on public\.profiles/);
    assert.doesNotMatch(sql, /drop trigger if exists profiles_reserve_username/);
    assert.doesNotMatch(sql, /enforce_reserved_username/);
    assert.doesNotMatch(sql, /create policy "Users update own profile"/i);
    assert.match(username, /create trigger profiles_reserve_username/);
    assert.match(username, /before insert or update of username on public\.profiles/);
  });

  it("ships a read-only verify script", () => {
    assert.match(verify, /profiles\.pinned_post_id/);
    assert.match(verify, /profiles_reserve_username/);
    assert.match(verify, /profiles_enforce_own_pin/);
    assert.match(verify, /has_function_privilege\('anon'/);
    assert.match(verify, /on delete set null/);
    assert.doesNotMatch(verify, /^\s*(insert|update|delete|truncate|drop|alter|grant|revoke)\b/im);
  });
});

describe("profile pin menu and tabs", () => {
  it("pins from your own post menu and filters the profile", () => {
    const tweet = readFileSync(join(process.cwd(), "components/tweet.tsx"), "utf8");
    const menu = tweet.slice(tweet.indexOf("function PostMenu"), tweet.indexOf("export function Engagement"));
    assert.match(menu, /Pin to profile/);
    assert.match(menu, /Unpin/);
    assert.match(menu, /pinPost\(post\.id\)/);
    assert.match(menu, /unpinPost\(\)/);
    const ownMenu = menu.slice(menu.indexOf("open && mine"));
    assert.match(ownMenu, /Pin to profile/);
    const safety = menu.slice(0, menu.indexOf("open && mine"));
    assert.doesNotMatch(safety, /Pin to profile/);

    const profile = readFileSync(join(process.cwd(), "components/profile-view.tsx"), "utf8");
    assert.match(profile, /PROFILE_TAB_LABELS/);
    assert.match(profile, /grid-cols-4/);
    assert.match(profile, /overflow-x-hidden/);
    assert.match(profile, /min-w-0/);
    assert.match(profile, /withPinnedFirst/);
    assert.match(profile, /profileMediaItems/);
    assert.match(profile, /profileCardsTab/);
    assert.match(profile, /loadProfilePublicCards/);
    assert.match(profile, /OpenToOffersFilter/);
    assert.match(profile, /pinned=\{item\.key\.startsWith\("pinned:"\)\}/);
    assert.match(tweet, />\s*Pinned\s*</);
    assert.doesNotMatch(profile, /from\("cards"\)/);
    assert.doesNotMatch(profile, /overflow-x-auto/);
    assert.doesNotMatch(profile, /w-max/);
    assert.match(profile, /isOwn && cardsReady && collection\.length === 0/);
    assert.match(
      profile,
      /Cards are private by default\.[\s\S]{0,240}mark a card public to show it here\./,
    );
  });
});
