import { supabaseConfig } from "./supabase/config";
export function imageUrl(path: string | null | undefined) {
  const config = supabaseConfig();
  if (!config || !path) return null;
  return `${config.url}/storage/v1/object/public/profile-images/${path.split("/").map(encodeURIComponent).join("/")}`;
}
