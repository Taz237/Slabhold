"use client";

import { useSyncExternalStore } from "react";
import { NotificationSettings } from "@/components/push/notification-settings";
import { isNativeApp } from "@/lib/ios/platform";

const noopSubscribe = () => () => {};

/**
 * Settings > Notifications. The iOS app has no push yet (ios-push-1), so it
 * gets a short note instead of the web's Home Screen steps.
 */
export function NotificationsGate() {
  const native = useSyncExternalStore(noopSubscribe, isNativeApp, () => false);
  if (!native) return <NotificationSettings />;
  return (
    <div className="pb-4">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <p className="mt-1.5 text-sm text-zinc-500">Notifications aren&apos;t on in the iPhone app yet</p>
    </div>
  );
}
