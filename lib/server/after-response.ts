import { after } from "next/server";

type Schedule = (task: () => Promise<void>) => void;

/**
 * Run work the response doesn't need (alerts, bookkeeping) once the response
 * is sent. Outside a request scope (a script, a test) `after` throws, so the
 * task runs inline as before. Never throws: the caller's response stands.
 */
export async function runAfterResponse(
  task: () => Promise<void>,
  schedule: Schedule = (work) => after(work),
): Promise<void> {
  const safe = async () => {
    try {
      await task();
    } catch (err) {
      console.warn("[after]", err instanceof Error ? err.message : err);
    }
  };
  try {
    schedule(safe);
  } catch {
    await safe();
  }
}
