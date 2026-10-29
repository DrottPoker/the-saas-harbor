import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { imageInfo, MAX_IMAGE_SIDE } from "./image-format";
import type { Database } from "./supabase/types";
import { invalid } from "./validation";

export async function uploadImage(
  client: SupabaseClient<Database>,
  owner: string,
  file: FormDataEntryValue | null,
) {
  if (!(file instanceof File) || !file.size) return null;
  if (file.size > 2 * 1024 * 1024) throw new Error(invalid("image.size"));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = imageInfo(bytes);
  if (!image || file.type !== image.type) throw new Error(invalid("image.format"));
  // A small file can still unpack to a huge picture that every visitor's browser would decode.
  if (!image.width || !image.height || Math.max(image.width, image.height) > MAX_IMAGE_SIDE)
    throw new Error(invalid("image.dimensions", { max: MAX_IMAGE_SIDE }));
  const path = `${owner}/${crypto.randomUUID()}.${image.extension}`;
  const { error } = await client.storage
    .from("profile-images")
    .upload(path, bytes, { contentType: image.type, upsert: false });
  if (error) throw new Error(invalid("image.failed"));
  return path;
}
