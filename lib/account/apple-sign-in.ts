/**
 * Sign in with Apple and account deletion. Deleting the Slabhold account removes
 * everything we store, but Apple still lists Slabhold under the person's Apple
 * Account until they remove it there (or we revoke the token, which we don't do
 * yet). So after the delete we show them where to finish.
 */

/** Where to tap on the iPhone, in order. */
export const APPLE_FINISH_STEPS = [
  "Settings",
  "your name",
  "Sign-In & Security",
  "Sign in with Apple",
  "Slabhold",
  "Stop Using",
] as const;

export const APPLE_FINISH_COPY = {
  title: "Your account is deleted",
  body: "One last step, on your iPhone. You signed in with Apple, so Apple still lists Slabhold on your Apple Account. To remove it:",
  done: "Done",
} as const;

function isApple(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase() === "apple";
}

/** True when the auth user has ever signed in with Apple. Anything unexpected is false. */
export function usedAppleSignIn(user: unknown): boolean {
  if (!user || typeof user !== "object") return false;
  const { app_metadata: meta, identities } = user as { app_metadata?: unknown; identities?: unknown };
  if (meta && typeof meta === "object") {
    const { provider, providers } = meta as { provider?: unknown; providers?: unknown };
    if (isApple(provider)) return true;
    if (Array.isArray(providers) && providers.some(isApple)) return true;
  }
  if (Array.isArray(identities)) {
    return identities.some((identity) => !!identity && typeof identity === "object" && isApple((identity as { provider?: unknown }).provider));
  }
  return false;
}
