import { redirect } from "next/navigation";
import { MailDayForm } from "@/components/mail-day-form";
import { getAuthUserId } from "@/lib/supabase/server";

export default async function MailDayPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login");
  return <MailDayForm />;
}
