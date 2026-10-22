import { redirect } from "next/navigation";

/** Bookmarks and old links. next.config redirects this path before the page runs. */
export default function MailDayPage() {
  redirect("/cards/new");
}
