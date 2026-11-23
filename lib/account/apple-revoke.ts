import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { normalizePem } from "@/lib/push/apns-config";

/**
 * Revoking a Sign in with Apple token when an account is deleted (App Store
 * rule 5.1.1(v)). Server only. Uses the Sign in with Apple key, which is not
 * the push key. With any of the four settings missing this does nothing and
 * never calls Apple.
 */
export type AppleRevokeConfig = {
  teamId: string;
  keyId: string;
  /** The Services ID used for web Sign in with Apple. */
  clientId: string;
  privateKey: KeyObject;
};

type Env = Record<string, string | undefined>;

export const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const APPLE_AUDIENCE = "https://appleid.apple.com";
/** Apple allows up to six months. One call needs minutes. */
export const CLIENT_SECRET_TTL_SECONDS = 5 * 60;
const REQUEST_TIMEOUT_MS = 8000;

const NAMES = ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_CLIENT_ID", "APPLE_PRIVATE_KEY"] as const;

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

/** The Sign in with Apple key from the environment, or null (revoke is off). Never logs the key. */
export function appleRevokeConfig(env: Env = process.env): AppleRevokeConfig | null {
  const teamId = env.APPLE_TEAM_ID?.trim();
  const keyId = env.APPLE_KEY_ID?.trim();
  const clientId = env.APPLE_CLIENT_ID?.trim();
  const privateKey = parseKey(env.APPLE_PRIVATE_KEY);
  if (!teamId || !keyId || !clientId || !privateKey) return null;
  return { teamId, keyId, clientId, privateKey };
}

/** Why appleRevokeConfig() is null, for the server log. Setting names only, never a value. */
export function appleRevokeConfigProblems(env: Env = process.env): string[] {
  const problems: string[] = NAMES.filter((name) => !env[name]?.trim()).map((name) => `${name} missing`);
  if (env.APPLE_PRIVATE_KEY?.trim() && !parseKey(env.APPLE_PRIVATE_KEY)) {
    problems.push("APPLE_PRIVATE_KEY is not a valid .p8 key");
  }
  return problems;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

/** Apple's client_secret: an ES256 JWT, signed the same way as the APNs provider token. */
export function appleClientSecret(config: AppleRevokeConfig, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(
    JSON.stringify({
      iss: config.teamId,
      iat,
      exp: iat + CLIENT_SECRET_TTL_SECONDS,
      aud: APPLE_AUDIENCE,
      sub: config.clientId,
    }),
  );
  const input = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(input), { key: config.privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${base64url(signature)}`;
}

export type AppleTokenHint = "refresh_token" | "access_token";

export type AppleRevokeResult =
  | { revoked: true }
  | { revoked: false; reason: "unconfigured" | "no-token" | "network" }
  | { revoked: false; reason: "http"; status: number };

/**
 * Asks Apple to revoke the token. 200 means revoked (or already invalid).
 * Never throws. Logs the outcome and setting names only: never the token,
 * the JWT or the key.
 */
export async function revokeAppleToken(
  input: { token: string; tokenTypeHint: AppleTokenHint },
  deps: { env?: Env; fetch?: typeof fetch; now?: () => number; log?: (...args: unknown[]) => void } = {},
): Promise<AppleRevokeResult> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((...args: unknown[]) => console.info(...args));
  const config = appleRevokeConfig(env);
  if (!config) {
    log("[apple-revoke] unconfigured", appleRevokeConfigProblems(env).join(", "));
    return { revoked: false, reason: "unconfigured" };
  }
  const token = input.token.trim();
  if (!token) return { revoked: false, reason: "no-token" };

  const form = new URLSearchParams({
    client_id: config.clientId,
    client_secret: appleClientSecret(config, (deps.now ?? Date.now)()),
    token,
    token_type_hint: input.tokenTypeHint,
  });
  let status: number;
  try {
    const response = await (deps.fetch ?? fetch)(APPLE_REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    status = response.status;
  } catch {
    log("[apple-revoke] network");
    return { revoked: false, reason: "network" };
  }
  if (status === 200) {
    log("[apple-revoke] revoked");
    return { revoked: true };
  }
  log("[apple-revoke] failed", status);
  return { revoked: false, reason: "http", status };
}
