/** One account switch. Off until the owner turns it on. */
export const HUNTER_SETTING_LABEL = "Show me as a hunter on cards I want";

export const HUNTER_SETTING_HELP =
  "Others can see you want a card and follow you. Prices and notes stay private.";

export function hunterPromptDismissKey(userId: string): string {
  return `slabhold.hunter-prompt.dismissed.${userId}`;
}

/** The want-list line is shown only while the account is opted out and has not dismissed it. */
export function hunterPromptVisible(input: { showAsHunter: boolean; dismissed: boolean }): boolean {
  return !input.showAsHunter && !input.dismissed;
}

export type HunterSettingError = { message: string; code?: string } | null;

export type HunterSettingResult = {
  data: { show_as_hunter?: boolean | null } | null;
  error: HunterSettingError;
};

export type HunterSettingFilter = {
  eq(column: string, value: string): HunterSettingFilter;
  select(columns: string): HunterSettingFilter;
  maybeSingle(): Promise<HunterSettingResult>;
};

export type HunterSettingDb = {
  from(table: string): {
    select(columns: string): HunterSettingFilter;
    update(values: { show_as_hunter: boolean }): HunterSettingFilter;
  };
};

export type HunterSettingRead = {
  showAsHunter: boolean;
  error?: string;
};

function columnMissing(error: HunterSettingError): boolean {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "42703") return true;
  return /show_as_hunter/i.test(error.message) && /column|schema cache/i.test(error.message);
}

/** False when the column is still missing or the row has not opted in. */
export async function readShowAsHunter(db: HunterSettingDb, userId: string): Promise<HunterSettingRead> {
  try {
    const { data, error } = await db
      .from("profiles")
      .select("show_as_hunter")
      .eq("id", userId)
      .maybeSingle();
    if (columnMissing(error)) return { showAsHunter: false };
    if (error) return { showAsHunter: false, error: error.message };
    return { showAsHunter: data?.show_as_hunter === true };
  } catch (caught) {
    return {
      showAsHunter: false,
      error: caught instanceof Error ? caught.message : "Couldn't load that setting.",
    };
  }
}

/**
 * Writes the flag, then reads it back.
 * The returned value is the stored flag, so a failed write does not look saved.
 */
export async function saveAndReloadShowAsHunter(
  db: HunterSettingDb,
  userId: string,
  showAsHunter: boolean,
): Promise<HunterSettingRead> {
  try {
    const wrote = await db
      .from("profiles")
      .update({ show_as_hunter: showAsHunter })
      .eq("id", userId)
      .select("show_as_hunter")
      .maybeSingle();
    if (wrote.error) return { showAsHunter: false, error: wrote.error.message };
    if (!wrote.data) return { showAsHunter: false, error: "Couldn't save that setting." };
  } catch (caught) {
    return {
      showAsHunter: false,
      error: caught instanceof Error ? caught.message : "Couldn't save that setting.",
    };
  }
  return readShowAsHunter(db, userId);
}
