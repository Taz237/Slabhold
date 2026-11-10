/** Exact handles that are test accounts even when they miss the prefixes. */
export const TEST_ACCOUNT_HANDLES = ["qa_vreset_1021"] as const;

/**
 * QA, fixture, and reset accounts. Matched at the start of the handle.
 * `qa-` is included even though signup usernames cannot contain a hyphen.
 */
export const TEST_ACCOUNT_PREFIXES = ["qa_", "qa-", "test_", "vreset_"] as const;

/**
 * App Store review account. Not a test account: it signs in, follows and posts
 * like anyone, and stays in suggestions (the suggest_collectors SQL mirrors
 * TEST_ACCOUNT_HANDLES, so it is kept off that list). Only lists that show
 * real collectors' cards, like Moving today, leave it out.
 */
export const REVIEW_ACCOUNT_HANDLES = ["slabhold_review"] as const;

/** True for the App Store review account. */
export function isReviewAccount(username: string) {
  return listed(REVIEW_ACCOUNT_HANDLES, normalizeAccountHandle(username));
}

/** Official accounts. Prefix rules must not treat these as test accounts. */
export const KEPT_ACCOUNT_HANDLES = ["slabhold", "slabholdupdates", "grokbotreview"] as const;

/**
 * Left out of follow suggestions only.
 * These are not test accounts, and their posts stay in the feed.
 */
export const NOT_SUGGESTED_HANDLES = ["slabholdupdates", "grokbotreview"] as const;

function listed(handles: readonly string[], handle: string) {
  return handles.includes(handle);
}

/** Lowercase handle without a leading @. */
export function normalizeAccountHandle(username: string) {
  return username.trim().toLowerCase().replace(/^@+/, "");
}

/** True for internal test and QA accounts. Official accounts stay false. */
export function isTestAccount(username: string) {
  const handle = normalizeAccountHandle(username);
  if (!handle) return false;
  if (listed(KEPT_ACCOUNT_HANDLES, handle)) return false;
  if (listed(TEST_ACCOUNT_HANDLES, handle)) return true;
  return TEST_ACCOUNT_PREFIXES.some((prefix) => handle.startsWith(prefix));
}
