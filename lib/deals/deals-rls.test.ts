import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { confirmAllowed, dealRateAllows } from "./state";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const migration = "supabase/migrations/20261023000500_deal_log.sql";

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
    assert.equal(sql.includes("pg_catalog.coalesce("), false);
    assert.equal(sql.includes("pg_catalog.nullif("), false);
    assert.equal(sql.includes("pg_catalog.greatest("), false);
    assert.equal(sql.includes("pg_catalog.least("), false);
    assert.match(sql, /price must be positive/);
    assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/);
    assert.match(sql, /before insert or update of sold_at, sold_deal_id/);
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
    const cancelAt = respond.indexOf("status = 'cancelled'");
    const soldAt = respond.indexOf("return 'already sold'");
    const confirmAt = respond.indexOf("status = 'confirmed'");
    assert.ok(declineAt > 0);
    assert.ok(blockAt > declineAt);
    assert.ok(cancelAt > blockAt);
    assert.ok(soldAt > cancelAt);
    assert.ok(confirmAt > soldAt);
    assert.equal(respond.includes("raise exception 'already sold'"), false);
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
      "no_qualified_coalesce",
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

  it("calls private.create_deal on PostgreSQL 17", async (t) => {
    if (!process.env.DEAL_TEST_DATABASE_URL) {
      if (process.env.CI) {
        throw new Error("DEAL_TEST_DATABASE_URL is required in CI");
      }
      t.skip("DEAL_TEST_DATABASE_URL not set: PG17 deal test skipped");
      return;
    }
    const seller = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const buyer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const seller2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const buyer2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const card = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const database = `deal_log_${process.pid}`;
    const maintenance = "postgres";
    const version = Number(psql(maintenance, "select current_setting('server_version_num')::int"));
    assert.ok(version >= 170000 && version < 180000, `expected PostgreSQL 17, got ${version}`);
    psql(maintenance, `drop database if exists ${database}`);
    psql(maintenance, `create database ${database}`);
    try {
      psql(
        database,
        `
        create schema if not exists auth;
        create or replace function auth.uid()
        returns uuid
        language sql
        stable
        as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;

        do $roles$
        begin
          if not exists (select 1 from pg_roles where rolname = 'anon') then
            create role anon nologin;
          end if;
          if not exists (select 1 from pg_roles where rolname = 'authenticated') then
            create role authenticated nologin;
          end if;
        end
        $roles$;

        create table public.profiles (
          id uuid primary key,
          username text not null
        );

        create table public.cards (
          id uuid primary key,
          user_id uuid not null,
          player text not null,
          year integer not null,
          "set" text not null,
          grade text not null default '',
          parallel text not null default '',
          estimated_value numeric(12, 2) not null default 0,
          image_url text,
          card_number text not null default '',
          sport text not null default '',
          accent text not null default '#7c5cff',
          is_public boolean not null default false,
          category text not null default 'flipping',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          no_number boolean not null default false,
          year_label text,
          set_name text,
          set_is_custom boolean not null default false,
          parallel_is_custom boolean not null default false,
          serial_run integer,
          serial_no integer,
          is_rookie boolean not null default false,
          is_auto boolean not null default false,
          is_relic boolean not null default false,
          condition_type text not null default 'raw',
          grader text not null default '',
          grade_qualifier text not null default '',
          open_to_offers boolean not null default false,
          sell_price numeric(12, 2),
          sell_date date
        );

        create table public.messages (
          id uuid primary key default gen_random_uuid(),
          sender_id uuid not null,
          receiver_id uuid not null
        );

        create table public.notifications (
          id uuid primary key default gen_random_uuid(),
          recipient_id uuid not null,
          actor_id uuid,
          kind text not null,
          preview text,
          href text,
          metadata jsonb
        );

        create schema if not exists private;
        create or replace function private.is_blocked(a uuid, b uuid)
        returns boolean
        language sql
        stable
        as $$ select false $$;
        `,
      );
      psql(database, read(migration));
      psql(
        database,
        `
        insert into public.profiles (id, username) values
          ('${seller}', 'seller'),
          ('${buyer}', 'buyer'),
          ('${seller2}', 'seller2'),
          ('${buyer2}', 'buyer2');
        insert into public.cards (id, user_id, player, year, "set", card_number, parallel, sport)
        values ('${card}', '${seller}', 'Jordan Love', 2020, 'Select', '47', 'Base', 'Football');
        insert into public.cards (id, user_id, player, year, "set", card_number)
        select
          ('c0000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
          '${seller2}',
          'Burst ' || g::text,
          2021,
          'Prizm',
          g::text
        from generate_series(1, 9) g;
        insert into public.messages (sender_id, receiver_id) values
          ('${seller}', '${buyer}'),
          ('${seller2}', '${buyer}'),
          ('${seller2}', '${buyer2}');
        `,
      );

      const created = psql(
        database,
        `
        select private.create_deal(
          '${card}'::uuid,
          '${buyer}'::uuid,
          'sale',
          1250
        )::text
        from (select set_config('request.jwt.claim.sub', '${seller}', true)) as session;
        `,
      );
      assert.match(created, /^[0-9a-f-]{36}$/);

      const row = psql(
        database,
        `
        select card_player || '|' || card_year || '|' || card_set || '|' || card_number || '|' || status || '|' || price_cents::text
        from public.deals;
        `,
      );
      assert.equal(row, "Jordan Love|2020|Select|47|pending|1250");
      const preview = psql(database, "select preview from public.notifications;");
      assert.equal(preview, "Confirm deal for Jordan Love?");

      const negative = psqlFailure(
        database,
        `
        select private.create_deal(
          '${card}'::uuid,
          '${buyer}'::uuid,
          'sale',
          -1
        )
        from (select set_config('request.jwt.claim.sub', '${seller}', true)) as session;
        `,
      );
      assert.match(negative, /price must be positive/);
      assert.doesNotMatch(negative, /price too high/);

      psql(
        database,
        `
        update public.cards
        set sell_price = 12.50, sell_date = current_date
        where id = '${card}';
        `,
      );
      const refused = psql(
        database,
        `
        select private.respond_deal('${created}'::uuid, 'confirmed')
        from (select set_config('request.jwt.claim.sub', '${buyer}', true)) as session;
        `,
      );
      assert.equal(refused, "already sold");
      const cancelled = psql(
        database,
        `select status from public.deals where id = '${created}';`,
      );
      assert.equal(cancelled, "cancelled");

      const burst = await Promise.all(
        Array.from({ length: 8 }, (_, index) => {
          const cardId = `c0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
          return psqlAsync(
            database,
            `
            select private.create_deal(
              '${cardId}'::uuid,
              '${buyer}'::uuid,
              'sale',
              100
            )::text
            from (select set_config('request.jwt.claim.sub', '${seller2}', true)) as session;
            `,
          );
        }),
      );
      const accepted = burst.filter(
        (result) => result.status === 0 && /^[0-9a-f-]{36}$/.test(result.stdout.trim()),
      );
      const limited = burst.filter((result) => /too many deals/.test(`${result.stderr}\n${result.stdout}`));
      assert.equal(accepted.length, 5, burst.map((result) => result.stderr).join("\n"));
      assert.equal(limited.length, 3);

      const otherPair = psql(
        database,
        `
        select private.create_deal(
          'c0000000-0000-4000-8000-000000000009'::uuid,
          '${buyer2}'::uuid,
          'trade',
          null
        )::text
        from (select set_config('request.jwt.claim.sub', '${seller2}', true)) as session;
        `,
      );
      assert.match(otherPair, /^[0-9a-f-]{36}$/);
      const counts = psql(
        database,
        `
        select buyer_id::text || ':' || count(*)::text
        from public.deals
        where seller_id = '${seller2}'
        group by buyer_id
        order by buyer_id;
        `,
      );
      assert.equal(counts, `${buyer}:5\n${buyer2}:1`);

      const report = psql(database, read("scripts/verify-deals.sql"));
      const failed = report
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.endsWith("|FAIL"));
      assert.deepEqual(failed, [], report);
    } finally {
      psql(maintenance, `drop database if exists ${database} with (force)`);
    }
  });
});

function databaseUrl(base: string, database: string): string {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}

function psql(database: string, sql: string): string {
  const result = runPsql(database, sql);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `psql exited ${result.status}`);
  }
  return result.stdout.trim();
}

function psqlFailure(database: string, sql: string): string {
  const result = runPsql(database, sql);
  assert.notEqual(result.status, 0);
  return `${result.stderr}\n${result.stdout}`;
}

function psqlCommand(database: string): { command: string; args: string[] } {
  const url = process.env.DEAL_TEST_DATABASE_URL;
  if (!url) throw new Error("DEAL_TEST_DATABASE_URL is not set");
  return {
    command: "psql",
    args: [databaseUrl(url, database), "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-f", "-"],
  };
}

function runPsql(database: string, sql: string): { status: number; stdout: string; stderr: string } {
  const { command, args } = psqlCommand(database);
  const result = spawnSync(command, args, { encoding: "utf8", input: sql });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function psqlAsync(database: string, sql: string): Promise<{ status: number; stdout: string; stderr: string }> {
  const { command, args } = psqlCommand(database);
  return new Promise((resolve) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ status: status ?? 1, stdout, stderr });
    });
    child.stdin.end(sql);
  });
}
