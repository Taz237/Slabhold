"use client";

import { useSyncExternalStore } from "react";
import { NotificationSettings, SkeletonRows, card } from "@/components/push/notification-settings";
import { isNativeApp } from "@/lib/ios/platform";
import { lazyPart } from "@/lib/ui/lazy-part";

const noopSubscribe = () => () => {};

/** The settings' shape while the app's own chunk loads. */
function Loading() {
  return (
    <div className="pb-4" aria-busy="true">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <div className={`mt-6 ${card}`}>
        <SkeletonRows rows={2} />
      </div>
    </div>
  );
}

/** Its own chunk: web visitors never load it. */
const NativeNotificationSettings = lazyPart(
  () => import("@/components/native/native-notification-settings").then((mod) => mod.NativeNotificationSettings),
  Loading,
  { name: "native-notification-settings" },
);

/**
 * Settings > Notifications. In the iOS app: the real settings with this
 * iPhone's switch when the build has push (build 4+) and APNs is on;
 * otherwise (old builds, or APNs off) a short note.
 */
export function NotificationsGate() {
  const native = useSyncExternalStore(noopSubscribe, isNativeApp, () => false);
  if (!native) return <NotificationSettings />;
  const note = (
    <div className="pb-4">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <p className="mt-1.5 text-sm text-zinc-500">Push notifications are off in the iPhone app right now</p>
    </div>
  );
  return <NativeNotificationSettings fallback={note} />;
}
