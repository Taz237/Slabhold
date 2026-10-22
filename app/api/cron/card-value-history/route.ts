import { runCardValueHistory } from "@/lib/collection/card-value-history-run";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  return header === `Bearer ${secret}`;
}

/**
 * Daily card-value history. Off unless CARD_VALUE_HISTORY_ENABLED=1.
 * Not listed in vercel.json. Donnie must approve the SQL and this cron
 * before it is scheduled. Do not apply the migration from 7 to 11 PM ET.
 * Reads cached card_values only.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  const result = await runCardValueHistory();
  return Response.json(result);
}
