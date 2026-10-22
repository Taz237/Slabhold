import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const migration = "supabase/migrations/20261022234124_deal_log.sql";

describe("deal log SQL", () => {
  it("wraps the migration and keeps writes on security definer RPCs", () => {
    const sql = read(migration);
    assert.match(sql, /^begin;/m);
    assert.match(sql, /set local lock_timeout = '5s';/);
    assert.match(sql, /^commit;/m);
    assert.match(sql, /create table if not exists public\.deals/);
    assert.match(sql, /seller_id <> buyer_id/);
    assert.match(sql, /kind in \('sale', 'trade'\)/);
    assert.match(sql, /price_cents is null or price_cents >= 0/);
    assert.match(sql, /status in \('pending', 'confirmed', 'declined', 'cancelled'\)/);
    assert.match(sql, /create unique index if not exists deals_one_pending_per_card[\s\S]*where status = 'pending'/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /auth\.uid\(\) = seller_id or auth\.uid\(\) = buyer_id/);
    assert.match(sql, /revoke all on public\.deals from anon, authenticated/);
    assert.match(sql, /grant select on public\.deals to authenticated/);
    assert.doesNotMatch(sql, /grant insert, update, delete on public\.deals to authenticated/i);
    for (const name of ["create_deal", "respond_deal", "cancel_deal"]) {
      assert.match(sql, new RegExp(`function private\\.${name}[\\s\\S]*security definer[\\s\\S]*set search_path = public`));
      assert.match(sql, new RegExp(`function public\\.${name}`));
    }
    assert.match(sql, /kind <> 'deal_confirm'/);
    assert.match(sql, /'deal_confirm'/);
    assert.match(sql, /Confirm deal for /);
    assert.match(sql, /open_to_offers = false/);
    assert.match(sql, /sold_at = now\(\)/);
    assert.match(sql, /where is_public = true\s+and sold_at is null\s+and \(sell_date is null or sell_price is null\)/);
    assert.equal(/marketplace/i.test(sql), false);
    const metadata = sql.slice(sql.indexOf("jsonb_build_object"), sql.indexOf("return v_deal"));
    assert.equal(metadata.includes("price_cents"), false);
  });

  it("points the snapshot writer and public view at unsold cards", () => {
    const totals = read("lib/collection/totals.ts");
    assert.match(totals, /cardsCountedInCollectionTotals/);
    const shared = read("lib/collection/totals-shared.ts");
    assert.match(shared, /function cardsCountedInCollectionTotals[\s\S]*!isSold\(card\)/);
  });

  it("ships a read-only verify script", () => {
    const verify = read("scripts/verify-deals.sql");
    const code = verify
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    assert.match(code, /from pg_class/);
    assert.match(code, /deals_one_pending_per_card/);
    assert.match(code, /has_table_privilege/);
    const statements = code.replace(/'(?:''|[^'])*'/g, "''");
    assert.doesNotMatch(statements, /\b(insert|update|delete|drop|alter|truncate)\b/i);
  });
});
