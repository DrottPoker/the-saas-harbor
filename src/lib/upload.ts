import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

export async function uploadImage(client: SupabaseClient<Database>, owner: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || !file.size) return null;
  if (file.size > 2 * 1024 * 1024) throw new Error("Choose an image smaller than 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const format = png ? ["png", "image/png"] : jpeg ? ["jpg", "image/jpeg"] : webp ? ["webp", "image/webp"] : null;
  if (!format || file.type !== format[1]) throw new Error("Choose a valid PNG, JPEG, or WebP image.");
  const path = `${owner}/${crypto.randomUUID()}.${format[0]}`;
  const { error } = await client.storage.from("profile-images").upload(path, bytes, { contentType: format[1], upsert: false });
  if (error) throw new Error("The image could not be uploaded. Please try again.");
  return path;
}

