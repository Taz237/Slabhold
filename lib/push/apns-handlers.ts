import type { HandlerResult } from "./handlers";
import { UNAVAILABLE } from "./handlers";

/** Most iPhones one account keeps. The oldest goes first. */
export const MAX_APNS_DEVICES = 10;

const TOKEN = /^[0-9a-f]{64,200}$/;

/** An APNs device token from the body: hex, lowercased. Anything else is null. */
export function parseApnsToken(body: unknown): string | null {
  const raw = (body as { token?: unknown } | null)?.token;
  if (typeof raw !== "string") return null;
  const token = raw.trim().toLowerCase();
  return TOKEN.test(token) ? token : null;
}

export type ApnsWriteResult = { error: string | null; missingTable?: boolean };

/** Service-role writes to push_apns_devices. */
export type ApnsDeviceWriter = {
  /** Insert or move this token to `userId` (the newest signed-in user on that phone), then keep the newest few. */
  upsert(userId: string, token: string): Promise<ApnsWriteResult>;
  /** Only the caller's own row. */
  remove(userId: string, token: string): Promise<ApnsWriteResult>;
};

/** Off: the same body as the web routes, as a 503. */
export const APNS_UNAVAILABLE: HandlerResult = { status: 503, body: UNAVAILABLE.body };
const UNAUTHORIZED: HandlerResult = { status: 401, body: { error: "Log in to turn on notifications." } };
const BAD_TOKEN: HandlerResult = { status: 400, body: { error: "Unknown device." } };

/** PostgREST and Postgres codes for "that table isn't there" (migration not applied yet). */
export function isMissingTable(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return /push_apns_devices/.test(message) && /does not exist|schema cache/.test(message);
}

export async function handleApnsRegister(input: {
  available: boolean;
  userId: string | null;
  body: unknown;
  writer: ApnsDeviceWriter | null;
}): Promise<HandlerResult> {
  if (!input.available || !input.writer) return APNS_UNAVAILABLE;
  if (!input.userId) return UNAUTHORIZED;
  const token = parseApnsToken(input.body);
  if (!token) return BAD_TOKEN;
  const { error, missingTable } = await input.writer.upsert(input.userId, token);
  if (missingTable) return APNS_UNAVAILABLE;
  if (error) return { status: 500, body: { error: "Could not save this device." } };
  return { status: 200, body: { ok: true, available: true } };
}

export async function handleApnsRemove(input: {
  available: boolean;
  userId: string | null;
  body: unknown;
  writer: ApnsDeviceWriter | null;
}): Promise<HandlerResult> {
  if (!input.available || !input.writer) return APNS_UNAVAILABLE;
  if (!input.userId) return UNAUTHORIZED;
  const token = parseApnsToken(input.body);
  if (!token) return BAD_TOKEN;
  const { error, missingTable } = await input.writer.remove(input.userId, token);
  if (missingTable) return APNS_UNAVAILABLE;
  if (error) return { status: 500, body: { error: "Could not remove this device." } };
  return { status: 200, body: { ok: true } };
}
