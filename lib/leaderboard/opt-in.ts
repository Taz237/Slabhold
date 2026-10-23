export const LEADERBOARD_OPT_IN_LABEL = "Show me on leaderboards";

export const LEADERBOARD_OPT_IN_HELP =
  "Your public cards can appear on the Value board. Turning this off takes you off the board. Off until you turn it on.";

export function leaderboardPromptDismissKey(userId: string): string {
  return `slabhold.leaderboard-prompt.dismissed.${userId}`;
}

/** Shown once, after the book crosses the leaderboard minimums, while still opted out. */
export function leaderboardPromptVisible(input: {
  eligible: boolean;
  optedIn: boolean;
  dismissed: boolean;
}): boolean {
  return input.eligible && !input.optedIn && !input.dismissed;
}

export type LeaderboardOptInError = { message: string; code?: string } | null;

export type LeaderboardOptInResult = {
  data: { leaderboard_opt_in?: boolean | null } | null;
  error: LeaderboardOptInError;
};

export type LeaderboardOptInFilter = {
  eq(column: string, value: string): LeaderboardOptInFilter;
  select(columns: string): LeaderboardOptInFilter;
  maybeSingle(): Promise<LeaderboardOptInResult>;
};

export type LeaderboardOptInDb = {
  from(table: string): {
    select(columns: string): LeaderboardOptInFilter;
    update(values: { leaderboard_opt_in: boolean }): LeaderboardOptInFilter;
  };
};

function columnMissing(error: LeaderboardOptInError): boolean {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "42703") return true;
  return /leaderboard_opt_in/i.test(error.message) && /column|schema cache/i.test(error.message);
}

/** False when the column is missing or the row has not opted in. */
export async function readLeaderboardOptIn(
  db: LeaderboardOptInDb,
  userId: string,
): Promise<{ optedIn: boolean; error?: string }> {
  try {
    const { data, error } = await db
      .from("profiles")
      .select("leaderboard_opt_in")
      .eq("id", userId)
      .maybeSingle();
    if (columnMissing(error)) return { optedIn: false };
    if (error) return { optedIn: false, error: error.message };
    return { optedIn: data?.leaderboard_opt_in === true };
  } catch (caught) {
    return {
      optedIn: false,
      error: caught instanceof Error ? caught.message : "Couldn't load that setting.",
    };
  }
}

/** Writes the flag, then reads it back so a failed write does not look saved. */
export async function saveLeaderboardOptIn(
  db: LeaderboardOptInDb,
  userId: string,
  optedIn: boolean,
): Promise<{ optedIn: boolean; error?: string }> {
  try {
    const wrote = await db
      .from("profiles")
      .update({ leaderboard_opt_in: optedIn })
      .eq("id", userId)
      .select("leaderboard_opt_in")
      .maybeSingle();
    if (wrote.error) return { optedIn: false, error: wrote.error.message };
    if (!wrote.data) return { optedIn: false, error: "Couldn't save that setting." };
  } catch (caught) {
    return {
      optedIn: false,
      error: caught instanceof Error ? caught.message : "Couldn't save that setting.",
    };
  }
  return readLeaderboardOptIn(db, userId);
}
