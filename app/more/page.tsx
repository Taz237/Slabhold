import { redirect } from "next/navigation";
import { MENU_OPEN_HREF } from "@/lib/ui/side-menu";

/** More moved into the side menu. Old links open it on the home page. */
export default function MorePage() {
  redirect(MENU_OPEN_HREF);
}
