import { isUuid } from "@/lib/value/card-value-access";

const BUCKETS = ["card-photos", "avatars", "covers", "post-images"] as const;

type StorageFolder = {
  list: (
    folder: string,
    opts?: { limit?: number; offset?: number },
  ) => Promise<{
    data: { name: string }[] | null;
    error: { message: string } | null;
  }>;
  remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
};

type RowResult = { error: { message: string } | null };

type EqDelete = {
  eq: (column: string, value: string) => Promise<RowResult>;
  in: (column: string, values: string[]) => Promise<RowResult>;
};

type NotificationPatch = {
  eq: (
    column: string,
    value: string,
  ) => {
    eq: (column: string, value: string) => Promise<RowResult>;
    in: (column: string, values: readonly string[]) => Promise<RowResult>;
    or: (filters: string) => Promise<RowResult>;
  };
};

type NotificationUpdate = {
  preview?: string | null;
  href?: string | null;
};

type SelectedRow = {
  id?: string;
  username?: string | null;
};

export type AccountAdmin = {
  storage: {
    from: (bucket: string) => StorageFolder;
  };
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{
        data: SelectedRow[] | null;
        error: { message: string } | null;
      }>;
    };
    delete: () => EqDelete;
    update: (values: NotificationUpdate) => NotificationPatch;
  };
  auth: {
    admin: {
      deleteUser: (userId: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export type AccountDeleteResult = {
  status: number;
  body: { ok?: boolean; error?: string };
};

const MAX_STORAGE_PASSES = 50;
const CARD_ID_CHUNK = 50;
const STORAGE_NO_PROGRESS = "storage cleanup made no progress";
const WANT_ALERT_AFTER_DELETE = "Someone posted a card you want";
const WRITTEN_PREVIEW_KINDS = ["comment", "mention", "quote"] as const;

function listedNames(data: { name: string }[] | null): string[] {
  return (data ?? [])
    .map((file) => file.name)
    .filter(Boolean)
    .sort();
}

export async function removeStorage(
  admin: AccountAdmin,
  userId: string,
): Promise<string | null> {
  for (const bucket of BUCKETS) {
    const folder = admin.storage.from(bucket);
    let previous: string | null = null;
    let finished = false;
    for (let pass = 0; pass < MAX_STORAGE_PASSES; pass++) {
      const listed = await folder.list(userId, { limit: 100, offset: 0 });
      if (listed.error) return listed.error.message;
      const names = listedNames(listed.data);
      if (names.length === 0) {
        finished = true;
        break;
      }
      const signature = names.join("\0");
      if (signature === previous) return STORAGE_NO_PROGRESS;
      const removed = await folder.remove(names.map((name) => `${userId}/${name}`));
      if (removed.error) return removed.error.message;
      previous = signature;
    }
    if (!finished) return STORAGE_NO_PROGRESS;
  }
  return null;
}

async function deleteEq(
  admin: AccountAdmin,
  table: string,
  column: string,
  value: string,
): Promise<string | null> {
  const { error } = await admin.from(table).delete().eq(column, value);
  return error ? error.message : null;
}

async function scrubActorNotifications(
  admin: AccountAdmin,
  userId: string,
): Promise<string | null> {
  const wantAlerts = await admin
    .from("notifications")
    .update({ preview: WANT_ALERT_AFTER_DELETE, href: "/collection" })
    .eq("actor_id", userId)
    .eq("kind", "want_alert");
  if (wantAlerts.error) return wantAlerts.error.message;

  const written = await admin
    .from("notifications")
    .update({ preview: null, href: null })
    .eq("actor_id", userId)
    .in("kind", WRITTEN_PREVIEW_KINDS);
  if (written.error) return written.error.message;
  return null;
}

function chunkCardIds(ids: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += CARD_ID_CHUNK) {
    chunks.push(ids.slice(index, index + CARD_ID_CHUNK));
  }
  return chunks;
}

function uuidCardIds(ids: readonly string[]): string[] {
  return ids.filter(isUuid);
}

/**
 * PostgREST `like` writes `*` for the SQL `%` wildcard.
 * `href = '/cards/<id>'` is included beside `href LIKE '%/cards/<id>'`.
 */
function wantAlertHrefFilter(cardIds: readonly string[]): string {
  return cardIds
    .map((id) => `href.eq./cards/${id},href.like.*/cards/${id}`)
    .join(",");
}

/**
 * Sale alerts keep a null actor_id, so the actor scrub misses them. Rewrite any
 * want-alert link that still points at these cards, including an old username
 * path, before those cards go.
 */
async function scrubWantAlertCardHrefs(
  admin: AccountAdmin,
  cardIds: readonly string[],
): Promise<string | null> {
  for (const chunk of chunkCardIds(uuidCardIds(cardIds))) {
    const { error } = await admin
      .from("notifications")
      .update({ href: "/collection" })
      .eq("kind", "want_alert")
      .or(wantAlertHrefFilter(chunk));
    if (error) return error.message;
  }
  return null;
}

async function loadOwnCardIds(
  admin: AccountAdmin,
  userId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const cards = await admin.from("cards").select("id").eq("user_id", userId);
  if (cards.error) return { ids: [], error: cards.error.message };
  const ids = uuidCardIds(
    (cards.data ?? []).map((row) => row.id).filter((id): id is string => typeof id === "string"),
  );
  return { ids, error: null };
}

async function deleteCardValueSnapshots(
  admin: AccountAdmin,
  cardIds: readonly string[],
): Promise<string | null> {
  for (const chunk of chunkCardIds(uuidCardIds(cardIds))) {
    const { error } = await admin.from("card_value_snapshots").delete().in("card_id", chunk);
    if (error) return error.message;
  }
  return null;
}

/** A pre-migration database has no user_id column. That must not block account deletion. */
function snapshotUserColumnMissing(message: string): boolean {
  return (
    /42703|PGRST204/i.test(message) ||
    (/user_id/i.test(message) && /does not exist|schema cache|column/i.test(message))
  );
}

async function deleteSnapshotsByOwner(
  admin: AccountAdmin,
  userId: string,
): Promise<string | null> {
  const failed = await deleteEq(admin, "card_value_snapshots", "user_id", userId);
  if (failed && snapshotUserColumnMissing(failed)) return null;
  return failed;
}

async function deleteOwnRows(
  admin: AccountAdmin,
  userId: string,
  cardIds: readonly string[],
): Promise<string | null> {
  const steps: Array<[string, string]> = [
    ["want_alerts", "user_id"],
    ["want_list", "user_id"],
    ["comp_flags", "user_id"],
    ["comps_rate_limits", "user_id"],
    ["collection_snapshots", "user_id"],
    ["comments", "user_id"],
    ["reposts", "user_id"],
    ["likes", "user_id"],
    ["notifications", "recipient_id"],
  ];

  for (const [table, column] of steps) {
    const failed = await deleteEq(admin, table, column, userId);
    if (failed) return failed;
  }

  const snapshotError = await deleteCardValueSnapshots(admin, cardIds);
  if (snapshotError) return snapshotError;
  const ownerSnapshotError = await deleteSnapshotsByOwner(admin, userId);
  if (ownerSnapshotError) return ownerSnapshotError;

  for (const [table, column] of [
    ["messages", "sender_id"],
    ["messages", "receiver_id"],
    ["follows", "follower_id"],
    ["follows", "following_id"],
    ["posts", "user_id"],
    ["cards", "user_id"],
  ] as const) {
    const failed = await deleteEq(admin, table, column, userId);
    if (failed) return failed;
  }
  return null;
}

/**
 * Scrub notifications that point at this account, then delete storage, rows,
 * and the auth user. `userId` must already be the verified session id. The body
 * is ignored.
 */
export async function runAccountDelete(input: {
  sessionUserId: string | null;
  body: unknown;
  admin: AccountAdmin | null;
}): Promise<AccountDeleteResult> {
  void input.body;
  const userId = input.sessionUserId;
  if (!userId) {
    return { status: 401, body: { error: "You need to be signed in." } };
  }
  if (!input.admin) {
    console.error("[account-delete]", userId, "failed", "admin");
    return {
      status: 500,
      body: { error: "Account deletion is unavailable right now." },
    };
  }

  const cards = await loadOwnCardIds(input.admin, userId);
  if (cards.error) {
    console.error("[account-delete]", userId, "failed", "cards");
    return {
      status: 500,
      body: {
        error: "Couldn't delete your account data. Your account is still active.",
      },
    };
  }

  const scrubError = await scrubActorNotifications(input.admin, userId);
  if (scrubError) {
    console.error("[account-delete]", userId, "failed", "notifications");
    return {
      status: 500,
      body: {
        error: "Couldn't delete your account data. Your account is still active.",
      },
    };
  }

  const hrefError = await scrubWantAlertCardHrefs(input.admin, cards.ids);
  if (hrefError) {
    console.error("[account-delete]", userId, "failed", "card-hrefs");
    return {
      status: 500,
      body: {
        error: "Couldn't delete your account data. Your account is still active.",
      },
    };
  }

  const storageError = await removeStorage(input.admin, userId);
  if (storageError) {
    console.error("[account-delete]", userId, "failed", "storage");
    return {
      status: 500,
      body: {
        error: "Couldn't delete your uploaded images. Your account is still active.",
      },
    };
  }

  const rowError = await deleteOwnRows(input.admin, userId, cards.ids);
  if (rowError) {
    console.error("[account-delete]", userId, "failed", "rows");
    return {
      status: 500,
      body: {
        error: "Couldn't delete your account data. Your account is still active.",
      },
    };
  }

  const auth = await input.admin.auth.admin.deleteUser(userId);
  if (auth.error) {
    console.error("[account-delete]", userId, "failed", "auth");
    return {
      status: 500,
      body: { error: "Couldn't delete your login. Try again." },
    };
  }

  console.info("[account-delete]", userId, "deleted");
  return { status: 200, body: { ok: true } };
}
