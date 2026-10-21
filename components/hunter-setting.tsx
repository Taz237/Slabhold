"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useSocial } from "@/components/social-provider";
import {
  HUNTER_SETTING_HELP,
  HUNTER_SETTING_LABEL,
  hunterPromptDismissKey,
  hunterPromptVisible,
  readShowAsHunter,
  saveAndReloadShowAsHunter,
  type HunterSettingDb,
} from "@/lib/social/hunter-setting";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export function HunterSettingControl({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor="show-as-hunter" id="hunter-setting-label" className="text-sm font-bold">
          {HUNTER_SETTING_LABEL}
        </label>
        <p id="hunter-setting-help" className="mt-1 text-sm text-zinc-500">
          {HUNTER_SETTING_HELP}
        </p>
      </div>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id="show-as-hunter"
          type="checkbox"
          role="switch"
          aria-checked={checked}
          aria-describedby="hunter-setting-help"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-zinc-300 peer-checked:bg-violet-600 peer-disabled:opacity-50 dark:bg-white/20" />
        <span className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
      </span>
    </div>
  );
}

export function HunterSettingSwitch() {
  const { user } = useSocial();
  const [checked, setChecked] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = user?.id;
    if (!id) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    let cancel = false;
    void readShowAsHunter(supabase as unknown as HunterSettingDb, id).then((result) => {
      if (cancel) return;
      setChecked(result.showAsHunter);
      setError(result.error ?? null);
      setReady(true);
    });
    return () => {
      cancel = true;
    };
  }, [user?.id]);

  if (!user) return null;
  const userId = user.id;

  async function toggle(next: boolean) {
    const supabase = createSupabaseBrowser();
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const result = await saveAndReloadShowAsHunter(
      supabase as unknown as HunterSettingDb,
      userId,
      next,
    );
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setChecked(result.showAsHunter);
  }

  return (
    <section className="border-b border-zinc-200 px-4 py-4 dark:border-white/10">
      <HunterSettingControl checked={checked} disabled={!ready || busy} onToggle={(next) => void toggle(next)} />
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </section>
  );
}

/** One line at the top of the want list. Hidden once the account opts in or dismisses it. */
export function HunterPrompt() {
  const { user } = useSocial();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = user?.id;
    if (!id) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    let cancel = false;
    void readShowAsHunter(supabase as unknown as HunterSettingDb, id).then((result) => {
      if (cancel || result.error) return;
      const dismissed = window.localStorage.getItem(hunterPromptDismissKey(id)) === "1";
      setVisible(hunterPromptVisible({ showAsHunter: result.showAsHunter, dismissed }));
    });
    return () => {
      cancel = true;
    };
  }, [user?.id]);

  if (!visible || !user) return null;
  const userId = user.id;

  function dismiss() {
    window.localStorage.setItem(hunterPromptDismissKey(userId), "1");
    setVisible(false);
  }

  return (
    <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
      <Link href="/settings/privacy" className="min-w-0 flex-1 font-semibold underline">
        {HUNTER_SETTING_LABEL}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </p>
  );
}
