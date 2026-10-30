export type PushServerConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

type Env = Record<string, string | undefined>;

/**
 * VAPID keys from the environment, or null. Null turns push off: the routes
 * answer `available: false`, sends are no-ops, and the app shows
 * "Notifications aren't available yet". Removing VAPID_PRIVATE_KEY is the
 * fast off switch.
 */
export function pushServerConfig(env: Env = process.env): PushServerConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

/** The public key the browser subscribes with. Empty when push is off at build time. */
export function pushPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
}
