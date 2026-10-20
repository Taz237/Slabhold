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

function wantAlertCardHrefs(cardId: string, username: string | null): string[] {
  const hrefs: string[] = [];
  if (username) hrefs.push(`/u/${username}/cards/${cardId}`);
  hrefs.push(`/cards/${cardId}`);
  return hrefs;
}

/**
 * Sale alerts keep a null actor_id, so the actor scrub misses them. Rewrite any
 * want-alert link that still points at this user's cards before those cards go.
 */
async function scrubWantAlertCardHrefs(
  admin: AccountAdmin,
  userId: string,
  cardIds: string[],
): Promise<string | null> {
  if (cardIds.length === 0) return null;
  const profile = await admin.from("profiles").select("username").eq("id", userId);
  if (profile.error) return profile.error.message;
  const username =
    (profile.data ?? [])
      .map((row) => row.username?.trim() ?? "")
      .find((name) => name.length > 0) ?? null;
  const hrefs = cardIds.flatMap((cardId) => wantAlertCardHrefs(cardId, username));
  const { error } = await admin
    .from("notifications")
    .update({ href: "/collection" })
    .eq("kind", "want_alert")
    .in("href", hrefs);
  return error ? error.message : null;
}

async function deleteOwnRows(admin: AccountAdmin, userId: string): Promise<string | null> {
  const steps: Array<[string, string]> = [
    ["want_alerts", "user_id"],
    ["want_list", "user_id"],
    ["comp_flags", "user_id"],
    ["comps_rate_limits", "user_id"],
    ["collection_snapshots", "user_id"],
    ["comments", "user_id"],
    ["reposts", "user_id"],
    ["notifications", "recipient_id"],
  ];

  for (const [table, column] of steps) {
    const failed = await deleteEq(admin, table, column, userId);
    if (failed) return failed;
  }

  const cards = await admin.from("cards").select("id").eq("user_id", userId);
  if (cards.error) return cards.error.message;
  const cardIds = (cards.data ?? [])
    .map((row) => row.id)
    .filter((id): id is string => Boolean(id));
  const hrefError = await scrubWantAlertCardHrefs(admin, userId, cardIds);
  if (hrefError) return hrefError;
  if (cardIds.length > 0) {
    const { error } = await admin
      .from("card_value_snapshots")
      .delete()
      .in("card_id", cardIds);
    if (error) return error.message;
  }

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
 * Delete one user's storage, rows that must be removed explicitly, then the
 * auth user. `userId` must already be the verified session id. The body is ignored.
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

  const rowError = await deleteOwnRows(input.admin, userId);
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
