import { createPrivateKey, type KeyObject } from "node:crypto";

export type ApnsConfig = {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKey: KeyObject;
};

type Env = Record<string, string | undefined>;

/**
 * The .p8 text from Vercel. Pasted with real newlines, or on one line with
 * literal "\n" (how some dashboards store it). Surrounding quotes are dropped.
 */
export function normalizePem(raw: string): string {
  let text = raw.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  return text.replace(/\\r\\n|\\n/g, "\n").replace(/\r\n/g, "\n");
}

/**
 * The iPhone app's APNs key from the environment, or null. Null turns APNs
 * off: GET /api/push/apns says `available: false`, the app keeps its note,
 * and dispatch sends web push only. Never logs the key.
 */
export function apnsConfig(env: Env = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const bundleId = env.APNS_BUNDLE_ID?.trim();
  const privateKey = parseKey(env.APNS_PRIVATE_KEY);
  if (!keyId || !teamId || !bundleId || !privateKey) return null;
  return { keyId, teamId, bundleId, privateKey };
}

function parseKey(raw: string | undefined): KeyObject | null {
  const pem = raw?.trim();
  if (!pem) return null;
  try {
    const privateKey = createPrivateKey({ key: normalizePem(pem), format: "pem" });
    return privateKey.asymmetricKeyType === "ec" ? privateKey : null;
  } catch {
    return null;
  }
}

const NAMES = ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_BUNDLE_ID", "APNS_PRIVATE_KEY"] as const;

/**
 * Why apnsConfig() is null, for the server log: which settings are missing,
 * or that the key doesn't parse. Setting names only, never a value.
 */
export function apnsConfigProblems(env: Env = process.env): string[] {
  const problems: string[] = NAMES.filter((name) => !env[name]?.trim()).map((name) => `${name} missing`);
  if (env.APNS_PRIVATE_KEY?.trim() && !parseKey(env.APNS_PRIVATE_KEY)) {
    problems.push("APNS_PRIVATE_KEY is not a valid .p8 key");
  }
  return problems;
}
