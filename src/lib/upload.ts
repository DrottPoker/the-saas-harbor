import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { imageInfo, MAX_IMAGE_SIDE } from "./image-format";
import type { Database } from "./supabase/types";

export async function uploadImage(
  client: SupabaseClient<Database>,
  owner: string,
  file: FormDataEntryValue | null,
) {
  if (!(file instanceof File) || !file.size) return null;
  if (file.size > 2 * 1024 * 1024) throw new Error("Choose an image smaller than 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = imageInfo(bytes);
  if (!image || file.type !== image.type)
    throw new Error("Choose a valid PNG, JPEG, or WebP image.");
  // A small file can still unpack to a huge picture that every visitor's browser would decode.
  if (!image.width || !image.height || Math.max(image.width, image.height) > MAX_IMAGE_SIDE)
    throw new Error(`Choose an image up to ${MAX_IMAGE_SIDE} pixels wide and tall.`);
  const path = `${owner}/${crypto.randomUUID()}.${image.extension}`;
  const { error } = await client.storage
    .from("profile-images")
    .upload(path, bytes, { contentType: image.type, upsert: false });
  if (error) throw new Error("The image could not be uploaded. Please try again.");
  return path;
}
