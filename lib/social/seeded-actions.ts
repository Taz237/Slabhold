/**
 * Social provider functions that change data. On a server-drawn screen
 * (Home, Collection, a card page), a call made before the provider has its
 * snapshot waits for it and is replayed once it is ready. Both seeds use
 * this one list, so every screen holds the same taps.
 */
export const SEEDED_SOCIAL_ACTIONS: ReadonlySet<string> = new Set([
  "refresh",
  "signUp",
  "signIn",
  "signOut",
  "updateProfile",
  "toggleFollow",
  "followMany",
  "createPost",
  "updatePost",
  "deletePost",
  "pinPost",
  "unpinPost",
  "deleteComment",
  "toggleLike",
  "toggleRepost",
  "addComment",
  "markNotificationsRead",
  "sendMessage",
  "markThreadRead",
  "applySafetyChange",
  "refreshSuggestions",
]);
