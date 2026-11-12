import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import type { FixBoost, ScanFix } from "./fixes";

/**
 * The two calls learning-from-fixes makes (supabase/migrations/20261112120000_scan_fixes.sql).
 * Both are silent on failure: a missing table or an offline phone never
 * blocks a scan. Only used when scanFixesEnabled() is on.
 */

type BoostRow = { read_key?: unknown; right_identity?: unknown; right_parallel?: unknown; collectors?: unknown };

export async function recordScanFix(fix: ScanFix): Promise<void> {
  try {
    const supabase = await loadSupabaseBrowser();
    if (!supabase) return;
    await supabase.rpc("record_scan_fix", {
      p_read_key: fix.readKey,
      p_wrong_identity: fix.wrongIdentity,
      p_right_identity: fix.rightIdentity,
      p_right_parallel: fix.rightParallel,
    });
  } catch {
    // Learning is a bonus; the scan already worked.
  }
}

export function boostsFromRows(rows: unknown): FixBoost[] {
  if (!Array.isArray(rows)) return [];
  const boosts: FixBoost[] = [];
  for (const row of rows as BoostRow[]) {
    if (typeof row?.read_key !== "string" || typeof row.right_identity !== "string") continue;
    const collectors = Number(row.collectors);
    if (!Number.isInteger(collectors)) continue;
    boosts.push({
      readKey: row.read_key,
      rightIdentity: row.right_identity,
      rightParallel: typeof row.right_parallel === "string" ? row.right_parallel : "",
      collectors,
    });
  }
  return boosts;
}

export async function loadFixBoosts(readKey: string): Promise<FixBoost[]> {
  if (!readKey) return [];
  try {
    const supabase = await loadSupabaseBrowser();
    if (!supabase) return [];
    const { data, error } = await supabase.rpc("scan_fix_boosts", { p_read_keys: [readKey] });
    if (error) return [];
    return boostsFromRows(data);
  } catch {
    return [];
  }
}
