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

type EqDelete = {
  eq: (
    column: string,
    value: string,
  ) => Promise<{ error: { message: string } | null }>;
  in: (
    column: string,
    values: string[],
  ) => Promise<{ error: { message: string } | null }>;
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
        data: { id: string }[] | null;
        error: { message: string } | null;
      }>;
    };
    delete: () => EqDelete;
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
  const cardIds = (cards.data ?? []).map((row) => row.id).filter(Boolean);
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
