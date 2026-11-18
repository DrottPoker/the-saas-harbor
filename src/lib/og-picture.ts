import "server-only";
import { imageInfo } from "./image-format";
import { imageUrl } from "./images";

/** Uploads are at most this large (src/lib/upload.ts); a card embeds nothing larger. */
const MAX_PICTURE_BYTES = 2 * 1024 * 1024;

/**
 * A stored logo or photo as a data URI for a sharing card (`OgPicture`), or null, for which the
 * card shows initials. The card reads the file itself rather than giving next/og its address:
 * next/og reads an address without a time limit and fails the whole card when it cannot, and it
 * refuses addresses on this machine, where local Supabase serves images in development and tests.
 * Satori draws PNG and JPEG, told by the file's first bytes; other formats show initials, as the
 * site does.
 */
export async function ogPictureSource(path: string | null | undefined) {
  const url = path && /\.(png|jpe?g)$/i.test(path) ? imageUrl(path) : null;
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(3_000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    const type = imageInfo(bytes)?.type;
    if (bytes.length > MAX_PICTURE_BYTES || (type !== "image/png" && type !== "image/jpeg"))
      return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
