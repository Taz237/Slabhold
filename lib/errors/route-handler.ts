import { isSameOriginRequest } from "@/lib/push/origin";
import { parseClientErrorReport } from "@/lib/errors/report";

export const MAX_BODY_BYTES = 4096;

const empty = () => new Response(null, { status: 204 });

function senderKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/**
 * Checks, scrubs and logs one client error report. The sender's address is
 * only a rate-limit key: it is never logged.
 */
export async function handleClientError(
  request: Request,
  {
    limit,
    log,
    serverVersion = null,
  }: {
    limit: (key: string) => boolean;
    log: (line: string) => void;
    serverVersion?: string | null;
  },
): Promise<Response> {
  // Another site posting here is noise. Drop it quietly.
  if (!isSameOriginRequest(request)) return empty();

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  let text: string;
  try {
    text = await request.text();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const report = parseClientErrorReport(body);
  if (!report) return new Response(null, { status: 400 });

  if (!limit(senderKey(request))) return new Response(null, { status: 429 });

  log(`[client-error] ${JSON.stringify({ ...report, serverVersion })}`);
  return empty();
}
