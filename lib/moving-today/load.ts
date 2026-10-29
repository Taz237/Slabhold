import "server-only";

import { unstable_cache } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { cleanImageUrl } from "@/lib/social/link-preview";
import { createTtlCache, MOVING_TODAY_CACHE_SECONDS, MOVING_TODAY_ERROR_CACHE_MS } from "./cache";
import {
  assembleMovingToday,
  type ProfileRef,
  type PublicCardRef,
  type RawCompSale,
} from "./present";
import {
  addCalendarDays,
  freshenMovingToday,
  MOVING_MONTH_DAYS,
  MOVING_PUBLIC_CAP,
  MOVING_STRIP_MODE,
  newYorkDayWindow,
  RECENT_AVERAGE_DAYS,
} from "./rank";
import { emptyMovingToday, type MovingTodayPayload } from "./types";

const WINDOW_SALE_LIMIT = 2000;
const HISTORY_LIMIT = 2000;
const IN_CHUNK = 80;

const SALE_COLUMNS = "query_key, card_id, item_id, price, sold_at";
const CARD_COLUMNS =
  "id, user_id, player, year, year_label, set, set_name, grade, grader, condition_type, is_rookie, image_url, accent, sport";
const NEWEST_COLUMNS = `${CARD_COLUMNS}, created_at, estimated_value`;

type Row = Record<string, unknown>;
type Admin = NonNullable<ReturnType<typeof createSupabaseAdmin>>;

const memoryCache = createTtlCache<MovingTodayPayload>(
  MOVING_TODAY_CACHE_SECONDS * 1000,
  Date.now,
  MOVING_TODAY_ERROR_CACHE_MS,
);

function chunks<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function mapSale(row: Row): RawCompSale | null {
  const queryKey = typeof row.query_key === "string" ? row.query_key.trim() : "";
  const cardId = typeof row.card_id === "string" ? row.card_id : "";
  const itemId = typeof row.item_id === "string" ? row.item_id : "";
  const soldAt = typeof row.sold_at === "string" ? row.sold_at : "";
  const price = typeof row.price === "number" ? row.price : Number(row.price);
  if (!queryKey || !cardId || !itemId || !soldAt) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  return { queryKey, cardId, itemId, price, soldAt };
}

function mapCard(row: Row): PublicCardRef | null {
  const id = typeof row.id === "string" ? row.id : "";
  const userId = typeof row.user_id === "string" ? row.user_id : "";
  if (!id || !userId) return null;
  const yearLabel =
    (typeof row.year_label === "string" && row.year_label.trim()) ||
    (row.year != null && row.year !== "" ? String(row.year) : "");
  const setName =
    (typeof row.set_name === "string" && row.set_name.trim()) ||
    (typeof row.set === "string" ? row.set.trim() : "");
  const grader = typeof row.grader === "string" ? row.grader.trim() : "";
  const gradeText = typeof row.grade === "string" ? row.grade.trim() : "";
  const player =
    typeof row.player === "string" && row.player.trim() ? row.player.trim() : "Card";
  return {
    id,
    userId,
    player,
    yearLabel,
    setName,
    grade: [grader, gradeText].filter(Boolean).join(" "),
    imageUrl: typeof row.image_url === "string" ? cleanImageUrl(row.image_url) : null,
    accent: typeof row.accent === "string" && row.accent.trim() ? row.accent.trim() : "#7c5cff",
    grader,
    conditionType:
      row.condition_type === "raw" || row.condition_type === "graded" ? row.condition_type : null,
    isRookie: row.is_rookie === true,
    sport: typeof row.sport === "string" ? row.sport : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    estimatedValue:
      row.estimated_value == null || row.estimated_value === "" ? null : Number(row.estimated_value),
  };
}

async function selectSales(
  admin: Admin,
  build: (
    query: ReturnType<ReturnType<typeof admin.from>["select"]>,
  ) => ReturnType<ReturnType<typeof admin.from>["select"]>,
): Promise<RawCompSale[]> {
  const { data, error } = await build(admin.from("sold_comps_cache").select(SALE_COLUMNS));
  if (error) throw new Error(error.message);
  const sales: RawCompSale[] = [];
  for (const row of data ?? []) {
    const sale = mapSale(row as Row);
    if (sale) sales.push(sale);
  }
  return sales;
}

function utcMidnight(date: string): string {
  return `${date}T00:00:00Z`;
}

async function readWindowSales(
  admin: Admin,
  startDate: string,
  endDate: string,
): Promise<RawCompSale[]> {
  return selectSales(admin, (query) =>
    query
      .gte("sold_at", utcMidnight(startDate))
      .lt("sold_at", utcMidnight(endDate))
      .gt("price", 0)
      .neq("item_id", "__empty__")
      .not("query_key", "is", null)
      .order("sold_at", { ascending: false })
      .limit(WINDOW_SALE_LIMIT),
  );
}

/** One uncached read. Tests pass a fake `admin`. */
export async function readMovingToday(
  now: Date,
  admin: Admin | null = createSupabaseAdmin(),
): Promise<MovingTodayPayload> {
  const window = newYorkDayWindow(now);
  const updatedAt = now.toISOString();
  if (!admin) return emptyMovingToday(window.date);

  // Each wave runs its reads together. Only a read that needs an earlier
  // answer waits for it.
  const monthStart = addCalendarDays(window.date, -(MOVING_MONTH_DAYS - 1));
  const [sales, newest] = await Promise.all([
    readWindowSales(admin, monthStart, addCalendarDays(window.date, 1)),
    MOVING_STRIP_MODE === "all-public" ? readNewestPublicCards(admin, MOVING_PUBLIC_CAP) : [],
  ]);
  if (sales.length === 0 && newest.length === 0) {
    return { ...emptyMovingToday(window.date), updatedAt };
  }

  // Window sales' cards with the history. A sale's own card decides whether
  // its key needs an alternate, so that check does not wait for history.
  const keys = [...new Set(sales.map((sale) => sale.queryKey))];
  const historyStart = utcMidnight(addCalendarDays(monthStart, -RECENT_AVERAGE_DAYS));
  const historyEnd = utcMidnight(window.date);
  const saleIds = [...new Set(sales.map((sale) => sale.cardId))];
  const [historyGroups, saleCards, saleOwners, saleFlags] = await Promise.all([
    Promise.all(
      chunks(keys, IN_CHUNK).map((group) =>
        selectSales(admin, (query) =>
          query
            .in("query_key", group)
            .gte("sold_at", historyStart)
            .lt("sold_at", historyEnd)
            .gt("price", 0)
            .neq("item_id", "__empty__")
            .order("sold_at", { ascending: false })
            .limit(HISTORY_LIMIT),
        ),
      ),
    ),
    readPublicCards(admin, saleIds),
    readCardOwners(admin, saleIds),
    readCompFlags(admin, saleIds),
  ]);
  const history = historyGroups.flat();

  const saleIdSet = new Set(saleIds);
  const historyIds = [...new Set(history.map((sale) => sale.cardId))].filter((id) => !saleIdSet.has(id));
  const saleCovered = new Set(saleCards.map((card) => card.id));
  const missingKeys = [
    ...new Set(sales.filter((sale) => !saleCovered.has(sale.cardId)).map((sale) => sale.queryKey)),
  ];
  const [historyCards, historyOwners, historyFlags, alternates] = await Promise.all([
    readPublicCards(admin, historyIds),
    readCardOwners(admin, historyIds),
    readCompFlags(admin, historyIds),
    readAlternates(admin, missingKeys),
  ]);
  const cards = [...saleCards, ...historyCards];
  const covered = new Set(cards.map((card) => card.id));
  const extraIds = alternates.map((row) => row.cardId).filter((id) => !covered.has(id));
  const [extraCards, extraOwners, extraFlags] = await Promise.all([
    readPublicCards(admin, extraIds),
    readCardOwners(admin, extraIds),
    readCompFlags(admin, extraIds),
  ]);
  cards.push(...extraCards);
  const owners = [...saleOwners, ...historyOwners, ...extraOwners];
  const flags = [...saleFlags, ...historyFlags, ...extraFlags];

  const userIds = [...new Set([...cards, ...newest].map((card) => card.userId))];
  const profiles = await readProfiles(admin, userIds);
  return assembleMovingToday({
    today: window.date,
    asOf: window.date,
    updatedAt,
    sales,
    history,
    cards,
    newest,
    profiles,
    alternates,
    owners,
    flags,
  });
}

type Read = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** IN-list reads, all chunks at once. Rows keep chunk order, so results match a one-by-one read. */
async function readInChunks<T>(
  values: string[],
  read: (group: string[]) => Read,
  map: (row: Row) => T | null,
): Promise<T[]> {
  const groups = chunks(values, IN_CHUNK).filter((group) => group.length > 0);
  const results = await Promise.all(groups.map((group) => read(group)));
  const out: T[] = [];
  for (const { data, error } of results) {
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const item = map(row as Row);
      if (item) out.push(item);
    }
  }
  return out;
}

function readCardOwners(admin: Admin, ids: string[]): Promise<{ id: string; userId: string }[]> {
  return readInChunks(
    [...new Set(ids)],
    (group) => admin.from("cards").select("id, user_id").in("id", group),
    (record) => {
      const id = typeof record.id === "string" ? record.id : "";
      const userId = typeof record.user_id === "string" ? record.user_id : "";
      return id && userId ? { id, userId } : null;
    },
  );
}

function readCompFlags(
  admin: Admin,
  cardIds: string[],
): Promise<{ cardId: string; userId: string; itemId: string }[]> {
  return readInChunks(
    [...new Set(cardIds)],
    (group) => admin.from("comp_flags").select("card_id, user_id, item_id").in("card_id", group),
    (record) => {
      const cardId = typeof record.card_id === "string" ? record.card_id : "";
      const userId = typeof record.user_id === "string" ? record.user_id : "";
      const itemId = typeof record.item_id === "string" ? record.item_id : "";
      return cardId && userId && itemId ? { cardId, userId, itemId } : null;
    },
  );
}

function readPublicCards(admin: Admin, ids: string[]): Promise<PublicCardRef[]> {
  return readInChunks(
    [...new Set(ids)],
    (group) => admin.from("public_cards").select(CARD_COLUMNS).in("id", group),
    mapCard,
  );
}

/** Every public card, newest first, up to `limit`. Only the public_cards view. */
async function readNewestPublicCards(
  admin: Admin,
  limit: number,
): Promise<PublicCardRef[]> {
  const { data, error } = await admin
    .from("public_cards")
    .select(NEWEST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const cards: PublicCardRef[] = [];
  for (const row of data ?? []) {
    const card = mapCard(row as Row);
    if (card) cards.push(card);
  }
  return cards;
}

function readAlternates(admin: Admin, queryKeys: string[]): Promise<{ queryKey: string; cardId: string }[]> {
  return readInChunks(
    queryKeys,
    (group) => admin.from("card_values").select("card_id, query_key").in("query_key", group).limit(500),
    (record) => {
      const queryKey = typeof record.query_key === "string" ? record.query_key : "";
      const cardId = typeof record.card_id === "string" ? record.card_id : "";
      return queryKey && cardId ? { queryKey, cardId } : null;
    },
  );
}

function readProfiles(admin: Admin, userIds: string[]): Promise<ProfileRef[]> {
  return readInChunks(
    userIds,
    (group) => admin.from("profiles").select("id, username").in("id", group),
    (record) => {
      const id = typeof record.id === "string" ? record.id : "";
      const username = typeof record.username === "string" ? record.username : "";
      return id && username ? { id, username } : null;
    },
  );
}

/**
 * Cached catalog read from sold_comps_cache. No live listing fetch.
 * The mover list is cached with the time it was read (updatedAt). The heading is chosen from the sale date and
 * the current New York date after the cache returns. A thrown read is
 * remembered for about a minute, then tried again.
 */
export async function getMovingToday(now: Date = new Date()): Promise<MovingTodayPayload> {
  const cached = await unstable_cache(
    () => memoryCache.read(() => readMovingToday(new Date())),
    // v3: movers, then every public card, with kind and counts. An older cached shape is not reused.
    ["moving-today-v3"],
    { revalidate: MOVING_TODAY_CACHE_SECONDS },
  )();
  return freshenMovingToday(cached, now);
}
