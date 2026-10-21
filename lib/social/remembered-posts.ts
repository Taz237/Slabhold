import type { Post, Profile } from "./types";

/** Posts and profiles loaded past the home snapshot. Survives refreshRemote. */
export type RememberedPosts = {
  posts: Map<string, Post>;
  profiles: Map<string, Profile>;
};

export function createRememberedPosts(): RememberedPosts {
  return { posts: new Map(), profiles: new Map() };
}

export function storeRemembered(
  memory: RememberedPosts,
  posts: readonly Post[],
  profiles: readonly Profile[],
  blockedIds: ReadonlySet<string>,
) {
  for (const post of posts) {
    if (blockedIds.has(post.authorId)) {
      memory.posts.delete(post.id);
      continue;
    }
    memory.posts.set(post.id, post);
  }
  for (const profile of profiles) {
    if (blockedIds.has(profile.id)) {
      memory.profiles.delete(profile.id);
      continue;
    }
    memory.profiles.set(profile.id, profile);
  }
}

export function forgetRememberedPost(memory: RememberedPosts, postId: string) {
  memory.posts.delete(postId);
}

/**
 * Put remembered rows back onto a freshly loaded snapshot.
 * Skips blocked authors and posts deleted this session. Snapshot copies win when both exist.
 */
export function mergeRememberedSnapshot<
  T extends { posts: Post[]; profiles: Profile[]; blockedIds?: string[] },
>(snapshot: T, memory: RememberedPosts, removedPostIds: ReadonlySet<string>): T {
  const blocked = new Set(snapshot.blockedIds ?? []);
  const posts = [...snapshot.posts];
  const knownPosts = new Set(posts.map((post) => post.id));
  let addedPost = false;
  for (const post of memory.posts.values()) {
    if (removedPostIds.has(post.id) || blocked.has(post.authorId) || knownPosts.has(post.id)) continue;
    posts.push(post);
    knownPosts.add(post.id);
    addedPost = true;
  }
  const profiles = [...snapshot.profiles];
  const knownProfiles = new Set(profiles.map((profile) => profile.id));
  let addedProfile = false;
  for (const profile of memory.profiles.values()) {
    if (blocked.has(profile.id) || knownProfiles.has(profile.id)) continue;
    profiles.push(profile);
    knownProfiles.add(profile.id);
    addedProfile = true;
  }
  if (!addedPost && !addedProfile) return snapshot;
  return { ...snapshot, posts, profiles };
}

/** Snapshot first, then the map, so a post outside the newest 100 can still be reposted. */
export function findKnownPost(
  posts: readonly Post[],
  memory: RememberedPosts,
  postId: string,
  options?: { removedIds?: ReadonlySet<string>; blockedIds?: ReadonlySet<string> },
): Post | undefined {
  if (options?.removedIds?.has(postId)) return undefined;
  const post = posts.find((item) => item.id === postId) ?? memory.posts.get(postId);
  if (!post) return undefined;
  if (options?.blockedIds?.has(post.authorId)) return undefined;
  return post;
}
