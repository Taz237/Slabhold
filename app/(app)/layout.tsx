import { AppChrome } from "@/components/app-chrome";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppChrome>{children}</AppChrome>;
}
