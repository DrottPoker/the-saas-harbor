export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || url.includes("your-project") || key.includes("your-key")) return null;
  try {
    if (new URL(url).protocol !== "https:" && !url.startsWith("http://127.0.0.1")) return null;
  } catch {
    return null;
  }
  return { url, key };
}

// Session cookies travel only over https where the site is served over https, so a visit over
// plain http before the https redirect cannot expose them.
export const cookieOptions = {
  secure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"),
};
