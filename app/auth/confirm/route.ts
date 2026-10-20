import { type NextRequest } from "next/server";
import { handleAuthConfirm } from "@/lib/auth/confirm-request";

export function GET(request: NextRequest) {
  return handleAuthConfirm(request);
}
