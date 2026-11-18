import { MAX_SCAN_QUERIES } from "./comp";
import { insertNameOf } from "@/lib/cards/insert-name";
import { parseQuickCompParams } from "@/lib/quick-comp/respond";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import type { ScanCompResult } from "./comp";

export const SCAN_COMP_RATE_MESSAGE = "You're scanning quickly. Try again in a few minutes";

export type ScanCompRouteDeps = {
  enabled: () => boolean;
  userId: () => Promise<string | null>;
  /** False when this user is over the scan comp rate. Reads only, but still capped. */
  allow: (userId: string) => Promise<boolean>;
  lookup: (
    identity: QuickCompIdentity,
    userId: string,
    options: { serialRun: number | null; query: string | null; queries?: readonly string[] },
  ) => Promise<ScanCompResult>;
};

const PRIVATE = { "Cache-Control": "private, no-store" };

/** GET /api/scan/comp. Same fields as /api/quick-comp, cached sales only. */
export async function respondScanComp(request: Request, deps: ScanCompRouteDeps): Promise<Response> {
  if (!deps.enabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const userId = await deps.userId();
  if (!userId) return Response.json({ error: "Log in to see sold prices" }, { status: 401 });
  // run is ours (the card's print run); the rest are /api/quick-comp's fields.
  const params = new URL(request.url).searchParams;
  const runText = params.get("run");
  params.delete("run");
  // q: the live search this scan ran. Read from the shared cache only.
  const queries = [...new Set(params.getAll("q").map((item) => item.replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean))].slice(0, MAX_SCAN_QUERIES);
  params.delete("q");
  // insert: the insert the card # is in ("Rookie Code"). It only narrows which titles count.
  const insertName = insertNameOf({ insertName: params.get("insert") });
  params.delete("insert");
  const run = runText != null && /^\d{1,4}$/.test(runText) ? Number(runText) : null;
  if (runText != null && !run) return Response.json({ error: "run is not a print run" }, { status: 400 });
  const parsed = parseQuickCompParams(params);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  if (!(await deps.allow(userId))) {
    return Response.json({ error: SCAN_COMP_RATE_MESSAGE }, { status: 429, headers: PRIVATE });
  }
  const identity = insertName ? { ...parsed.identity, insertName } : parsed.identity;
  const result = await deps.lookup(identity, userId, { serialRun: run, query: queries[queries.length - 1] ?? null, queries });
  return Response.json(result, { headers: PRIVATE });
}
