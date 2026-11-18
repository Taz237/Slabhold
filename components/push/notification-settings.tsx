"use client";

import { useCallback, useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { BellOff, BellRing, Moon, Send, Share, Smartphone } from "lucide-react";
import { PushToast } from "@/components/push/soft-ask";
import { useSocial } from "@/components/social-provider";
import { trackEvent } from "@/lib/analytics";
import {
  currentSubscription,
  deviceOptedIn,
  devicePlatform,
  permissionState,
  pushFeatureOn,
  pushReady,
  pushServerAvailable,
  sendTestPush,
  subscribeDevice,
  unsubscribeDevice,
} from "@/lib/push/client";
import { DEFAULT_PREFS, PUSH_TOGGLES, prefsFromRow, prefsToRow, type NotificationPrefs, type PrefsRow } from "@/lib/push/prefs";
import { deviceTimeZone } from "@/lib/push/quiet-hours";
import type { PermissionState } from "@/lib/push/soft-ask";
import type { InstallPlatform } from "@/lib/pwa/install-step";
import { SheetLoadFailed } from "@/components/part-load-failed";
import { lazyPart } from "@/lib/ui/lazy-part";

const InstallGuide = lazyPart(
  () => import("@/components/onboarding/install-step").then((mod) => mod.InstallGuide),
  null,
  {
    name: "install-guide",
    failed: ({ retry, onDone }) => <SheetLoadFailed retry={retry} onClose={() => onDone("later")} />,
  },
);

type DeviceState =
  | { kind: "loading" }
  | { kind: "off-build" }
  | { kind: "unavailable" }
  | { kind: "in-app" }
  | { kind: "install-first" }
  | { kind: "unsupported" }
  | { kind: "denied"; ios: boolean }
  | { kind: "ready"; on: boolean };

export const card = "rounded-2xl bg-white ring-1 ring-zinc-200 dark:bg-white/[0.04] dark:ring-white/10";
export const sectionLabel = "px-1 pb-2 text-13 font-medium text-zinc-500";

const noopSubscribe = () => () => {};

function useOnClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function isIos(platform: InstallPlatform): boolean {
  return platform === "installed"
    ? /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent)
    : platform === "ios-safari" || platform === "ios-browser";
}

export function Switch({
  checked,
  disabled,
  label,
  description,
  onChange,
  icon,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description?: string;
  onChange: (next: boolean) => void;
  icon?: ReactNode;
}) {
  const descriptionId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="tap flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none focus-visible:ring-inset disabled:opacity-50"
    >
      {icon ? (
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl big:hidden bg-[#7C3AED]/10 text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#A78BFA]">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-15 font-semibold">{label}</span>
        {description ? (
          <span id={descriptionId} className="mt-0.5 block text-13 leading-5 text-zinc-500">
            {description}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={`relative inline-flex h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none ${
          checked ? "bg-violet-600" : "bg-zinc-300 dark:bg-white/15"
        }`}
      >
        <span
          className={`absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none ${
            checked ? "translate-x-[20px]" : ""
          }`}
        />
      </span>
    </button>
  );
}

export function Note({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-4">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl big:hidden bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-15 font-semibold">{title}</p>
        {children ? <div className="mt-1 text-13 leading-5 text-zinc-500">{children}</div> : null}
      </div>
    </div>
  );
}

export function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div aria-hidden className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex min-h-14 items-center gap-3 px-4">
          <span className="skeleton-shimmer h-4 flex-1 rounded-full" style={{ maxWidth: `${50 + ((index * 17) % 35)}%` }} />
          <span className="skeleton-shimmer h-[31px] w-[51px] rounded-full" />
        </div>
      ))}
    </div>
  );
}

type PrefsLoad = { kind: "loading" } | { kind: "loaded" | "error"; userId: string };

/** The prefs read failed: no toggles (nothing to save over), just Retry. */
export function PrefsLoadFailed({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-6 text-center">
      <p className="text-15 text-zinc-500">Something went wrong. Try again.</p>
      <button
        type="button"
        onClick={retry}
        className="tap inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-15 font-semibold text-white hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Retry
      </button>
    </div>
  );
}

function readDevice(available: boolean, userId: string): Promise<DeviceState> {
  if (!pushFeatureOn()) return Promise.resolve({ kind: "off-build" });
  if (!available) return Promise.resolve({ kind: "unavailable" });
  const platform = devicePlatform();
  if (platform === "in-app") return Promise.resolve({ kind: "in-app" });
  if (platform === "ios-safari" || platform === "ios-browser") return Promise.resolve({ kind: "install-first" });
  if (!pushReady(platform)) return Promise.resolve({ kind: "unsupported" });
  const permission: PermissionState = permissionState();
  if (permission === "denied") return Promise.resolve({ kind: "denied", ios: isIos(platform) });
  if (permission !== "granted") return Promise.resolve({ kind: "ready", on: false });
  return currentSubscription().then((subscription) => ({
    kind: "ready",
    on: Boolean(subscription) && deviceOptedIn(userId),
  }));
}

/**
 * Settings > Notifications. `deviceSection` replaces the web's "This device"
 * section (the iPhone app passes its own); the prefs below are shared.
 */
export function NotificationSettings({ deviceSection }: { deviceSection?: ReactNode } = {}) {
  const hasDeviceSlot = deviceSection !== undefined;
  const { user, ready, mode } = useSocial();
  const onClient = useOnClient();
  const userId = user?.id ?? null;
  const [device, setDevice] = useState<DeviceState>({ kind: "loading" });
  const [loadedPrefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [prefsLoad, setPrefsLoad] = useState<PrefsLoad>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const local = Boolean(ready && userId && mode !== "supabase");
  // A load from another account (or an older attempt) counts as still loading.
  const loadStatus = !local && prefsLoad.kind !== "loading" && prefsLoad.userId === userId ? prefsLoad.kind : "loading";
  // Local accounts (no Supabase) have nothing to load: defaults, saved in memory.
  // Supabase accounts only get prefs once the read worked or found no row.
  const prefs = local ? (loadedPrefs ?? DEFAULT_PREFS) : loadStatus === "loaded" ? loadedPrefs : null;
  const [busy, setBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const zone = onClient ? deviceTimeZone() : null;

  const refreshDevice = useCallback(async () => {
    if (!userId || hasDeviceSlot) return;
    const available = await pushServerAvailable();
    setDevice(await readDevice(available, userId));
  }, [hasDeviceSlot, userId]);

  useEffect(() => {
    if (!userId || hasDeviceSlot) return;
    let cancelled = false;
    void pushServerAvailable()
      .then((available) => readDevice(available, userId))
      .then((state) => {
        if (!cancelled) setDevice(state);
      });
    return () => {
      cancelled = true;
    };
  }, [hasDeviceSlot, userId]);

  useEffect(() => {
    if (!ready || !userId || mode !== "supabase") return;
    let cancelled = false;
    void (async () => {
      const { loadSupabaseBrowser } = await import("@/lib/supabase/browser-lazy");
      const client = await loadSupabaseBrowser();
      if (!client) throw new Error("offline");
      const { data, error } = await client.from("notification_prefs").select("*").eq("user_id", userId).maybeSingle();
      // A failed read is not "no row": never show (or later save) defaults over a real row.
      if (error) throw new Error(error.message);
      if (cancelled) return;
      setPrefs(prefsFromRow((data as PrefsRow | null) ?? null));
      setPrefsLoad({ kind: "loaded", userId });
    })().catch(() => {
      if (cancelled) return;
      setPrefs(null);
      setPrefsLoad({ kind: "error", userId });
    });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, mode, ready, userId]);

  const retryLoad = () => {
    setPrefsLoad({ kind: "loading" });
    setLoadAttempt((attempt) => attempt + 1);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /** Optimistic: the switch moves now, and moves back if the save fails. */
  const save = useCallback(
    async (patch: Partial<NotificationPrefs>) => {
      if (!userId || !prefs) return;
      // Only write once the real row (or a confirmed missing one) is on screen.
      if (!local && loadStatus !== "loaded") return;
      const previous = prefs;
      const next = { ...prefs, ...patch, timeZone: deviceTimeZone() ?? prefs.timeZone };
      setPrefs(next);
      if (mode !== "supabase") return;
      try {
        const { loadSupabaseBrowser } = await import("@/lib/supabase/browser-lazy");
        const client = await loadSupabaseBrowser();
        if (!client) throw new Error("offline");
        const { error } = await client.from("notification_prefs").upsert(prefsToRow(userId, next), { onConflict: "user_id" });
        if (error) throw new Error(error.message);
      } catch {
        setPrefs(previous);
        setToast("Couldn't save. Try again.");
      }
    },
    [loadStatus, local, mode, prefs, userId],
  );

  const turnOn = () => {
    if (!userId) return;
    // From the tap itself: iOS only grants permission inside a user gesture.
    let answer: Promise<NotificationPermission>;
    try {
      answer = Promise.resolve(
        Notification.permission === "default" ? Notification.requestPermission() : Notification.permission,
      );
    } catch {
      answer = Promise.resolve(Notification.permission);
    }
    setBusy(true);
    void answer
      .then(async (result) => {
        trackEvent("push_permission_result", { result });
        if (result === "granted") {
          const ok = await subscribeDevice(userId);
          setToast(ok ? "Notifications on" : "Couldn't turn on notifications. Try again.");
        }
      })
      .finally(() => {
        setBusy(false);
        void refreshDevice();
      });
  };

  const turnOff = () => {
    if (!userId) return;
    setBusy(true);
    setDevice({ kind: "ready", on: false });
    void unsubscribeDevice(userId)
      .catch(() => setToast("Couldn't turn off notifications. Try again."))
      .finally(() => {
        setBusy(false);
        void refreshDevice();
      });
  };

  const sendTest = () => {
    setTesting(true);
    void sendTestPush()
      .then((result) => setToast(result.ok ? "Test sent" : (result.error ?? "Could not send a test.")))
      .finally(() => setTesting(false));
  };

  const prefsReady = prefs !== null;
  const prefsFailed = !prefsReady && loadStatus === "error";
  const deviceOn = device.kind === "ready" && device.on;
  const pushUsable = hasDeviceSlot || (device.kind !== "off-build" && device.kind !== "unavailable");

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          Choose what we push to your phone. Your notifications list always shows everything.
        </p>
      </div>

      {hasDeviceSlot ? (
        deviceSection
      ) : (
        <section aria-labelledby="push-device">
          <h2 id="push-device" className={sectionLabel}>
            This device
          </h2>
          <div className={card}>
            {device.kind === "loading" ? <SkeletonRows rows={1} /> : null}
            {device.kind === "off-build" || device.kind === "unavailable" ? (
              <Note icon={<BellOff className="h-5 w-5" />} title="Push notifications are off on this device">
                We couldn&apos;t turn them on here. Your notifications list still updates as usual.
              </Note>
            ) : null}
            {device.kind === "in-app" ? (
              <Note icon={<Smartphone className="h-5 w-5" />} title="Open Slabhold in your browser">
                This app&apos;s browser can&apos;t get push notifications. Open slabhold.app in Safari or Chrome.
              </Note>
            ) : null}
            {device.kind === "install-first" ? (
              <div>
                <Note icon={<Share className="h-5 w-5" />} title="Add Slabhold to your Home Screen first">
                  iPhone only sends notifications to apps on your Home Screen. Add Slabhold, open it from there, then
                  turn notifications on here.
                </Note>
                <div className="px-4 pb-4">
                  <button
                    type="button"
                    onClick={() => setGuideOpen(true)}
                    className="tap h-11 w-full rounded-full bg-violet-600 text-15 font-semibold text-white hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    Show me how
                  </button>
                </div>
              </div>
            ) : null}
            {device.kind === "unsupported" ? (
              <Note icon={<BellOff className="h-5 w-5" />} title="This browser can't get push notifications" />
            ) : null}
            {device.kind === "denied" ? (
              <Note icon={<BellOff className="h-5 w-5" />} title="Notifications are blocked">
                {device.ios ? (
                  <p>
                    To turn them back on, open iPhone <strong className="font-semibold text-zinc-700 dark:text-zinc-300">Settings</strong> →{" "}
                    <strong className="font-semibold text-zinc-700 dark:text-zinc-300">Notifications</strong> →{" "}
                    <strong className="font-semibold text-zinc-700 dark:text-zinc-300">Slabhold</strong>, and allow notifications.
                  </p>
                ) : (
                  <p>
                    To turn them back on, open your browser&apos;s{" "}
                    <strong className="font-semibold text-zinc-700 dark:text-zinc-300">site settings</strong> for slabhold.app (tap the
                    icon next to the address), set{" "}
                    <strong className="font-semibold text-zinc-700 dark:text-zinc-300">Notifications</strong> to Allow, then come back here.
                  </p>
                )}
              </Note>
            ) : null}
            {device.kind === "ready" ? (
              <div className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                <Switch
                  checked={deviceOn}
                  disabled={busy}
                  label="Push notifications"
                  description={deviceOn ? "On for this device." : "Get notified on this device."}
                  icon={<BellRing className="h-5 w-5" />}
                  onChange={(next) => (next ? turnOn() : turnOff())}
                />
                <div className="px-4 py-3">
                  <button
                    type="button"
                    onClick={sendTest}
                    disabled={!deviceOn || testing}
                    className="tap inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-15 font-semibold text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none disabled:text-zinc-400 dark:text-[#A78BFA] dark:disabled:text-zinc-600"
                  >
                    <Send aria-hidden className="h-4 w-4" />
                    {testing ? "Sending…" : "Send a test notification"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      )}

      <section aria-labelledby="push-types">
        <h2 id="push-types" className={sectionLabel}>
          Push me about
        </h2>
        <div className={`${card} divide-y divide-zinc-100 overflow-hidden dark:divide-white/[0.06]`}>
          {prefsReady ? (
            PUSH_TOGGLES.map((toggle) => (
              <Switch
                key={toggle.kind}
                checked={prefs[toggle.kind]}
                disabled={!pushUsable}
                label={toggle.label}
                onChange={(next) => void save({ [toggle.kind]: next })}
              />
            ))
          ) : prefsFailed ? (
            <PrefsLoadFailed retry={retryLoad} />
          ) : (
            <SkeletonRows rows={PUSH_TOGGLES.length} />
          )}
        </div>
      </section>

      {prefsFailed ? null : (
        <>
          <section aria-labelledby="push-previews">
            <h2 id="push-previews" className="sr-only">
              Previews
            </h2>
            <div className={card}>
              {prefsReady ? (
                <Switch
                  checked={prefs.showPreviews}
                  disabled={!pushUsable}
                  label="Show previews"
                  description="Show the text of replies and messages. Off, a notification just says “New reply” or “New message”."
                  onChange={(next) => void save({ showPreviews: next })}
                />
              ) : (
                <SkeletonRows rows={1} />
              )}
            </div>
          </section>
    
          <section aria-labelledby="push-quiet">
            <h2 id="push-quiet" className={sectionLabel}>
              Quiet hours
            </h2>
            <div className={`${card} divide-y divide-zinc-100 overflow-hidden dark:divide-white/[0.06]`}>
              {prefsReady ? (
                <>
                  <Switch
                    checked={prefs.quietEnabled}
                    disabled={!pushUsable}
                    label="Quiet hours"
                    description="Nothing is pushed during these hours. Your notifications list and badge still update."
                    icon={<Moon className="h-5 w-5" />}
                    onChange={(next) => void save({ quietEnabled: next })}
                  />
                  {prefs.quietEnabled ? (
                    <div className="grid grid-cols-2 big:grid-cols-1 gap-3 px-4 py-4">
                      <label className="block">
                        <span className="block text-13 font-medium text-zinc-500">From</span>
                        <input
                          type="time"
                          value={prefs.quietStart}
                          onChange={(event) => event.target.value && void save({ quietStart: event.target.value })}
                          className="mt-1.5 h-12 w-full rounded-xl bg-zinc-100 px-3 text-17 font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:bg-white/[0.06] dark:[color-scheme:dark]"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-13 font-medium text-zinc-500">Until</span>
                        <input
                          type="time"
                          value={prefs.quietEnd}
                          onChange={(event) => event.target.value && void save({ quietEnd: event.target.value })}
                          className="mt-1.5 h-12 w-full rounded-xl bg-zinc-100 px-3 text-17 font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:bg-white/[0.06] dark:[color-scheme:dark]"
                        />
                      </label>
                      <p className="col-span-2 text-13 text-zinc-500">
                        Your local time{zone ? ` (${zone.replace(/_/g, " ")})` : ""}.
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <SkeletonRows rows={1} />
              )}
            </div>
          </section>
        </>
      )}

      <p className="px-1 text-13 leading-5 text-zinc-500">
        What you choose here applies on all your devices. The push switch is just for this one.
      </p>

      {guideOpen ? <InstallGuide platform="ios-safari" variant="menu" onDone={() => setGuideOpen(false)} /> : null}
      {toast ? <PushToast text={toast} /> : null}
    </div>
  );
}
