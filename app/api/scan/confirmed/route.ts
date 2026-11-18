import { consumeRateLimit } from "@/lib/comps/rate-limit";
import { scanPreviewAllowed } from "@/lib/scan/confirm";
import { respondConfirmCard, respondConfirmedCards } from "@/lib/scan/coverage-respond";
import { knownConfirmedCard, readConfirmedCards, saveConfirmedCard } from "@/lib/scan/coverage-server";
import { getAuthUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 10;

const WINDOW_MS = 10 * 60 * 1000;
/** Reads: one per scan that found no card. */
const READ_LIMIT = 60;
/** Saves: one per card added from the choices. Kept low: a confirmation is a vote. */
const SAVE_LIMIT = 20;

const base = { enabled: () => scanPreviewAllowed(), userId: getAuthUserId, known: knownConfirmedCard };

export async function GET(request: Request) {
  return respondConfirmedCards(request, { ...base, allow: (userId) => consumeRateLimit(userId, "scan_confirmed", WINDOW_MS, READ_LIMIT), read: readConfirmedCards });
}

export async function POST(request: Request) {
  return respondConfirmCard(request, { ...base, allow: (userId) => consumeRateLimit(userId, "scan_confirm", WINDOW_MS, SAVE_LIMIT), save: saveConfirmedCard });
}
