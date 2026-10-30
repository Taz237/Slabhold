import { NotFoundInApp } from "@/components/app-chrome-lazy";

/** A link that matches no page renders here, outside app/(app): give it the shell. */
export default function NotFound() {
  return <NotFoundInApp />;
}
