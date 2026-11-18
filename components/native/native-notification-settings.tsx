"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BellOff, BellRing, Send } from "lucide-react";
import { NotificationSettings, Note, SkeletonRows, Switch, card, sectionLabel } from "@/components/push/notification-settings";
import { PushToast } from "@/components/push/soft-ask";
import { useSocial } from "@/components/social-provider";
import { trackEvent } from "@/lib/analytics";
import { loadNative } from "@/lib/ios/platform";
import { deviceOptedIn, rememberOptIn, sendTestPush } from "@/lib/push/client";
import {
  apnsServerAvailable,
  forgetApnsToken,
  nativeSettingsMode,
  saveApnsToken,
  type NativePermission,
} from "@/lib/push/native-client";

type Mode = "loading" | "settings" | "note";
export type Device = { kind: "loading" } | { kind: "denied" } | { kind: "ready"; on: boolean };

/** iOS Settings path, as the iPhone shows it. */
const DENIED_HELP = "Turn them on in iPhone Settings > Slabhold > Notifications.";

async function readDevice(userId: string): Promise<Device> {
  const native = await loadNative();
  const permission: NativePermission | null = await native.nativePushPermission();
  if (permission === "denied") return { kind: "denied" };
  return { kind: "ready", on: permission === "granted" && deviceOptedIn(userId) };
}

/** "Notifications on this iPhone": the switch and the test, in place of the web's "This device". */
export function NativeDeviceSection({ userId }: { userId: string }) {
  const [device, setDevice] = useState<Device>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void readDevice(userId)
      .then(setDevice)
      .catch(() => setDevice({ kind: "ready", on: false }));
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void readDevice(userId)
      .then((next) => {
        if (!cancelled) setDevice(next);
      })
      .catch(() => {
        if (!cancelled) setDevice({ kind: "ready", on: false });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const turnOn = () => {
    setBusy(true);
    void (async () => {
      const native = await loadNative();
      const token = await native.nativePushEnable();
      trackEvent("push_permission_result", { result: token ? "granted" : "denied" });
      if (!token) {
        if ((await native.nativePushPermission()) !== "denied") setToast("Couldn't turn on notifications. Try again.");
        return;
      }
      if (await saveApnsToken(token)) {
        rememberOptIn(userId, true);
        setToast("Notifications on");
      } else {
        setToast("Couldn't turn on notifications. Try again.");
      }
    })()
      .catch(() => setToast("Couldn't turn on notifications. Try again."))
      .finally(() => {
        setBusy(false);
        refresh();
      });
  };

  const turnOff = () => {
    setBusy(true);
    setDevice({ kind: "ready", on: false });
    rememberOptIn(userId, false);
    void (async () => {
      await forgetApnsToken();
      const native = await loadNative();
      await native.nativePushDisable();
    })()
      .catch(() => setToast("Couldn't turn off notifications. Try again."))
      .finally(() => {
        setBusy(false);
        refresh();
      });
  };

  const sendTest = () => {
    setTesting(true);
    void (async () => {
      // Save this iPhone's token again first, so a test also repairs a token the server lost.
      const native = await loadNative().catch(() => null);
      const token = await native?.nativePushToken().catch(() => null);
      if (token) await saveApnsToken(token);
      return sendTestPush();
    })()
      .then((result) => setToast(result.ok ? "Test sent" : (result.error ?? "Could not send a test.")))
      .catch(() => setToast("Could not send a test."))
      .finally(() => setTesting(false));
  };

  return (
    <>
      <NativeDeviceCard
        device={device}
        busy={busy}
        testing={testing}
        onToggle={(next) => (next ? turnOn() : turnOff())}
        onTest={sendTest}
      />
      {toast ? <PushToast text={toast} /> : null}
    </>
  );
}

/** The "This iPhone" card itself, state in, events out. */
export function NativeDeviceCard({
  device,
  busy,
  testing,
  onToggle,
  onTest,
}: {
  device: Device;
  busy: boolean;
  testing: boolean;
  onToggle: (next: boolean) => void;
  onTest: () => void;
}) {
  const on = device.kind === "ready" && device.on;
  return (
    <section aria-labelledby="push-iphone">
      <h2 id="push-iphone" className={sectionLabel}>
        This iPhone
      </h2>
      <div className={card}>
        {device.kind === "loading" ? <SkeletonRows rows={1} /> : null}
        {device.kind === "denied" ? (
          <Note icon={<BellOff className="h-5 w-5" />} title="Notifications are off for Slabhold">
            <p>{DENIED_HELP}</p>
          </Note>
        ) : null}
        {device.kind === "ready" ? (
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
            <Switch
              checked={on}
              disabled={busy}
              label="Notifications on this iPhone"
              description={on ? "On for this iPhone" : "Get notified on this iPhone"}
              icon={<BellRing className="h-5 w-5" />}
              onChange={onToggle}
            />
            <div className="px-4 py-3">
              <button
                type="button"
                onClick={onTest}
                disabled={!on || testing}
                className="tap inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-15 font-semibold text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none disabled:text-zinc-400 dark:text-[#A78BFA] dark:disabled:text-zinc-600"
              >
                <Send aria-hidden className="h-4 w-4" />
                {testing ? "Sending…" : "Send a test"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Settings > Notifications in the iPhone app. With the push plugin (build 4+)
 * and APNs on, the real settings with this iPhone's switch; otherwise the
 * `fallback` note the gate passes in (old builds, or APNs off).
 */
export function NativeNotificationSettings({ fallback }: { fallback: ReactNode }) {
  const { user } = useSocial();
  const [mode, setMode] = useState<Mode>("loading");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadNative()
        .then((native) => native.nativePushAvailable())
        .catch(() => false),
      apnsServerAvailable(),
    ]).then(([pluginAvailable, serverAvailable]) => {
      if (!cancelled) setMode(nativeSettingsMode({ pluginAvailable, serverAvailable }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (mode === "note") return <>{fallback}</>;
  if (mode === "loading" || !user) {
    return (
      <div className="pb-4" aria-busy="true">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <div className={`mt-6 ${card}`}>
          <SkeletonRows rows={2} />
        </div>
      </div>
    );
  }
  return <NotificationSettings deviceSection={<NativeDeviceSection userId={user.id} />} />;
}
