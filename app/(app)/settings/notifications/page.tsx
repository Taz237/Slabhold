import type { Metadata } from "next";
import { NotificationsGate } from "@/components/native/notifications-gate";

export const metadata: Metadata = {
  title: "Notifications",
};

/** Signed-out readers are sent to log in by the app shell (all /settings/* pages need an account). */
export default function NotificationsSettingsPage() {
  return <NotificationsGate />;
}
