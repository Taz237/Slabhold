import type { SupabaseClient } from "@supabase/supabase-js";
import { SAVE_TIMEOUT_MESSAGE, SaveTimeoutError } from "@/lib/save/attempt";

/**
 * Store a picked image in a public Storage bucket and return its URL.
 * Values that are already http(s) URLs are left alone. Null clears the image.
 * `createdPath` is set only when this call created a new object.
 */
export async function uploadMedia(
  supabase: SupabaseClient,
  bucket: string,
  userId: string,
  value: string | null,
  options?: { signal?: AbortSignal },
): Promise<{ url: string | null; error?: string; createdPath?: string }> {
  if (!value) return { url: null };
  if (!value.startsWith("data:")) return { url: value };

  const match = /^data:(.+?);base64,(.+)$/.exec(value);
  if (!match) return { url: null, error: "Could not read that image." };

  const mime = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const signal = options?.signal;

  const uploaded = (async () => {
    const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
      contentType: mime,
      upsert: false,
    });
    if (signal?.aborted) {
      await removeUploadedMedia(supabase, bucket, path);
      return {
        url: null as string | null,
        error: SAVE_TIMEOUT_MESSAGE,
        createdPath: path,
      };
    }
    if (error) return { url: null, error: error.message };
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl, createdPath: path };
  })();

  if (!signal) return uploaded;

  const aborted = new Promise<never>((_, reject) => {
    const fail = () => reject(new SaveTimeoutError());
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });
  void aborted.catch(() => undefined);

  try {
    return await Promise.race([uploaded, aborted]);
  } catch (error) {
    if (signal.aborted || error instanceof SaveTimeoutError) {
      return { url: null, error: SAVE_TIMEOUT_MESSAGE };
    }
    throw error;
  }
}

/** Best-effort delete for an object this save just created. */
export async function removeUploadedMedia(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<void> {
  try {
    await supabase.storage.from(bucket).remove([path]);
  } catch {
    // The save error is what the form shows. Cleanup is best effort.
  }
}
