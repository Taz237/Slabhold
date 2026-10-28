/** Headers for a share image the browser saves as a file. */
export function saveImageHeaders(filename: string, cacheControl: string): Headers {
  const safe = filename.replace(/[^a-z0-9._-]/gi, "-");
  return new Headers({
    "Content-Type": "image/png",
    "Content-Disposition": `attachment; filename="${safe}"`,
    "Cache-Control": cacheControl,
  });
}
