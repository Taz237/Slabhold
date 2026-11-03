import { parseGrade, parseYearLabel } from "@/lib/card-options";
import { SOLD_UNAVAILABLE_MESSAGE } from "@/lib/comps/sold-response";
import { clipWholeCharacters } from "@/lib/search/recent";
import type { QuickCompIdentity } from "./identity";
import type { QuickCompLimitReason } from "./limits";
import type { QuickCompPayload } from "./lookup";

export const QUICK_COMP_FIELD_LIMIT = 80;
const GRADE_LIMIT = 24;
const ALLOWED = new Set(["player", "year", "set", "number", "parallel", "grade"]);

export const QUICK_COMP_DAILY_MESSAGE = "You've used today's comps. Saved ones still open";
export const QUICK_COMP_HOURLY_MESSAGE = "You're checking comps quickly. Try again in a few minutes";

type LookupResult =
  | { ok: true; payload: QuickCompPayload }
  | { ok: false; reason: QuickCompLimitReason; resetAt: string }
  | { ok: false; reason: "unavailable" };

export type QuickCompRouteDeps = {
  enabled: () => boolean;
  userId: () => Promise<string | null>;
  lookup: (identity: QuickCompIdentity, userId: string) => Promise<LookupResult>;
};

function field(params: URLSearchParams, name: string, limit = QUICK_COMP_FIELD_LIMIT): string {
  return clipWholeCharacters((params.get(name) ?? "").trim().replace(/\s+/g, " "), limit);
}

/** Player and year are required. Set, number, parallel and grade are optional. */
export function parseQuickCompParams(
  params: URLSearchParams,
): { ok: true; identity: QuickCompIdentity } | { ok: false; error: string } {
  for (const key of params.keys()) {
    if (!ALLOWED.has(key)) return { ok: false, error: `Unknown field: ${clipWholeCharacters(key, 20)}` };
  }
  const playerName = field(params, "player");
  if (!playerName) return { ok: false, error: "player is required" };
  const year = parseYearLabel(field(params, "year", 12));
  if (!year) return { ok: false, error: "year is required" };
  const grade = field(params, "grade", GRADE_LIMIT) || "Raw";
  if (!parseGrade(grade).recognized) return { ok: false, error: "grade is not recognized" };
  return {
    ok: true,
    identity: {
      playerName,
      year: year.year,
      yearLabel: year.yearLabel,
      setBrand: field(params, "set"),
      cardNumber: field(params, "number", 20).replace(/^#/, ""),
      parallel: field(params, "parallel") || "Base",
      grade,
    },
  };
}

/** GET /api/quick-comp. The flag is checked before auth so off is a plain 404. */
export async function respondQuickComp(request: Request, deps: QuickCompRouteDeps): Promise<Response> {
  if (!deps.enabled()) return Response.json({ error: "Not found" }, { status: 404 });

  const userId = await deps.userId();
  if (!userId) return Response.json({ error: "Log in to comp a card" }, { status: 401 });

  const parsed = parseQuickCompParams(new URL(request.url).searchParams);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const result = await deps.lookup(parsed.identity, userId);
  if (result.ok) return Response.json(result.payload);
  if (result.reason === "daily" || result.reason === "hourly") {
    return Response.json(
      {
        error: result.reason === "daily" ? QUICK_COMP_DAILY_MESSAGE : QUICK_COMP_HOURLY_MESSAGE,
        reason: result.reason,
        resetAt: result.resetAt,
      },
      { status: 429 },
    );
  }
  return Response.json({ error: SOLD_UNAVAILABLE_MESSAGE }, { status: 503 });
}
