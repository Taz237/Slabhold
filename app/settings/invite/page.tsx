import type { Metadata } from "next";
import { InviteSettings } from "@/components/invite/invite-settings";

export const metadata: Metadata = {
  title: "Invite friends",
};

/** Signed-out readers are sent to log in by the app shell (all /settings/* pages need an account). */
export default function InviteSettingsPage() {
  return <InviteSettings />;
}
