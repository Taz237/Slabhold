import type { Metadata } from "next";
import { NotificationSettings } from "@/components/push/notification-settings";

export const metadata: Metadata = {
  title: "Notifications",
};

/** Signed-out readers are sent to log in by the app shell (all /settings/* pages need an account). */
export default function NotificationsSettingsPage() {
  return <NotificationSettings />;
}
