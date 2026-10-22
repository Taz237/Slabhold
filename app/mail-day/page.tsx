import { redirect } from "next/navigation";
import { MailDayForm } from "@/components/mail-day-form";
import { loginPath } from "@/lib/auth/safe-next";
import { getAuthUserId } from "@/lib/supabase/server";

export default async function MailDayPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect(loginPath("/mail-day"));
  return <MailDayForm />;
}
