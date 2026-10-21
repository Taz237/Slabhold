import type { SupabaseClient } from "@supabase/supabase-js";

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
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) return { url: null, error: error.message };

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, createdPath: path };
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
