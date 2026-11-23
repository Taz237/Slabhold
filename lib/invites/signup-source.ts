import { isNativeApp } from "@/lib/ios/platform";
import { readStoredUtm, type UtmProps } from "@/lib/utm";
import { inviteHandle, inviteStore, readInvite, type Invite } from "./attribution";

/**
 * Where a signup came from, written once into the new account's Supabase auth
 * user metadata (signUp options.data, or updateUser data after Apple/Google).
 * Never a table. Only these keys, only with values: never an IP, an email or a
 * device id.
 */
export const SIGNUP_SOURCE_KEYS = [
  "signup_source",
  "invite_from",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "signup_platform",
] as const;

export type SignupSource = "invite" | "utm" | "direct";
export type SignupPlatform = "ios-app" | "web";

export type SignupSourceMeta = {
  signup_source: SignupSource;
  signup_platform: SignupPlatform;
  invite_from?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
};

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;
const MAX_UTM = 100;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, MAX_UTM);
  return text ? text : null;
}

/**
 * Invite beats a campaign link (it names a person), a campaign link beats
 * direct. UTM values are the 7-day first touch, kept even on an invite.
 */
export function signupSourceMeta(input: {
  invite: Invite | null;
  utm: UtmProps | null | undefined;
  platform: SignupPlatform;
}): SignupSourceMeta {
  const inviter = inviteHandle(input.invite?.username ?? null);
  const utm: Partial<Record<(typeof UTM_KEYS)[number], string>> = {};
  for (const key of UTM_KEYS) {
    const value = clean(input.utm?.[key]);
    if (value) utm[key] = value;
  }
  const source: SignupSource = inviter ? "invite" : Object.keys(utm).length > 0 ? "utm" : "direct";
  return {
    signup_source: source,
    ...(inviter ? { invite_from: inviter } : {}),
    ...utm,
    signup_platform: input.platform === "ios-app" ? "ios-app" : "web",
  };
}

/**
 * Exactly what goes into user metadata: the allowed keys with non-empty
 * string values, nothing else. Empty when there is no source.
 */
export function signupSourceData(meta: unknown): Partial<SignupSourceMeta> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const source = meta as Record<string, unknown>;
  const data: Record<string, string> = {};
  for (const key of SIGNUP_SOURCE_KEYS) {
    const value = clean(source[key]);
    if (value) data[key] = value;
  }
  return data as Partial<SignupSourceMeta>;
}

/** This device's signup source: the 7-day invite and UTM first touch, and app or web. Never throws. */
export function browserSignupSource(now = Date.now()): SignupSourceMeta {
  const store = inviteStore();
  return signupSourceMeta({
    invite: store ? readInvite(store, now) : null,
    utm: readStoredUtm(now),
    platform: isNativeApp() ? "ios-app" : "web",
  });
}
