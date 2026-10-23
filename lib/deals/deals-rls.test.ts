import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { confirmAllowed, dealRateAllows } from "./state";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const migration = "supabase/migrations/20261022234124_deal_log.sql";

function functionBody(sql: string, name: string): string {
  const start = sql.search(new RegExp(`function ${name.replace(".", "\\.")}\\b`));
  assert.ok(start >= 0, name);
  const end = sql.indexOf("$$;", start);
  assert.ok(end > start, name);
  return sql.slice(start, end);
}

describe("deal log SQL", () => {
  it("wraps the migration and keeps writes on security definer RPCs", () => {
    const sql = read(migration);
    assert.match(sql, /^begin;/m);
    assert.match(sql, /set local lock_timeout = '5s';/);
    assert.match(sql, /^commit;/m);
    const functions = sql.match(/create or replace function/g) ?? [];
    const paths = sql.match(/set search_path = ''/g) ?? [];
    assert.equal(paths.length, functions.length);
    assert.equal(sql.includes("set search_path = public"), false);
    for (const name of ["create_deal", "respond_deal", "cancel_deal"]) {
      assert.match(
        sql,
        new RegExp(`function private\\.${name}[\\s\\S]*security definer[\\s\\S]*set search_path = ''`),
      );
      assert.match(sql, new RegExp(`function public\\.${name}`));
    }
    const view = sql.slice(sql.lastIndexOf("create or replace view public.public_cards"));
    assert.match(view, /sold_at is null/);
    assert.doesNotMatch(view, /sell_price is null/);
    const metadata = sql.slice(sql.indexOf("jsonb_build_object"), sql.indexOf("return v_deal"));
    assert.equal(metadata.includes("price_cents"), false);
    assert.equal(/marketplace/i.test(sql), false);
  });

  it("refuses a blocked pair on create and before confirm", () => {
    const sql = read(migration);
    const create = functionBody(sql, "private.create_deal");
    const respond = functionBody(sql, "private.respond_deal");
    assert.match(
      create,
      /if private\.is_blocked\(v_seller, p_buyer_id\) then\s+raise exception 'not allowed' using errcode = '42501';/,
    );
    const declineAt = respond.indexOf("return 'declined'");
    const blockAt = respond.indexOf("if private.is_blocked(v_deal.seller_id, v_buyer)");
    const soldAt = respond.indexOf("raise exception 'already sold'");
    const confirmAt = respond.indexOf("status = 'confirmed'");
    assert.ok(declineAt > 0);
    assert.ok(blockAt > declineAt);
    assert.ok(soldAt > blockAt);
    assert.ok(confirmAt > soldAt);
    assert.equal(confirmAllowed(true), false);
    assert.equal(confirmAllowed(false), true);
    assert.match(create, /v_recent >= 5/);
    assert.equal(dealRateAllows(5), false);
    assert.equal(dealRateAllows(4), true);
  });

  it("leaves collection snapshots on summarize, including realized profit", () => {
    const totals = read("lib/collection/totals.ts");
    assert.match(totals, /\(\(data \?\? \[\]\) as CardRow\[\]\)\.map\(mapCardRow\)/);
    assert.doesNotMatch(totals, /cardsCountedInCollectionTotals/);
    const shared = read("lib/collection/totals-shared.ts");
    assert.match(shared, /unrealizedProfit \+ totals\.realizedProfit/);
  });

  it("ships a read-only verify script with PASS and FAIL rows", () => {
    const verify = read("scripts/verify-deals.sql");
    const code = verify
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    const statements = code.replace(/'(?:''|[^'])*'/g, "''");
    assert.doesNotMatch(statements, /\b(insert|update|delete|drop|alter|truncate)\b/i);
    const names = [
      "deals_rls",
      "one_pending_deal",
      "seller_index",
      "buyer_index",
      "no_direct_write",
      "card_id_set_null",
      "card_snapshot",
      "price_cap",
      "empty_search_path",
      "block_on_create",
      "block_before_confirm",
      "hourly_limit",
      "sold_column_guard",
      "pending_cancelled_on_card_delete",
      "public_cards_deal_sold_only",
    ];
    for (const name of names) {
      assert.match(code, new RegExp(`'${name}'`));
    }
    assert.match(code, /'PASS'/);
    assert.match(code, /'FAIL'/);
    assert.match(code, /then 'PASS' else 'FAIL'/);
  });

  it("records the deals table and sold columns in schema.sql", () => {
    const schema = read("supabase/schema.sql");
    assert.match(schema, /create table if not exists public\.deals/);
    assert.match(schema, /sold_at timestamptz/);
    assert.match(schema, /sold_deal_id uuid/);
    assert.match(schema, /on delete set null/);
    assert.match(schema, /card_player text/);
    assert.match(schema, /deals_seller_idx/);
    assert.match(schema, /deals_buyer_idx/);
    assert.match(schema, /100000000/);
  });
});
