import "server-only";
import { supabaseConfig } from "./config";

/**
 * Whether Supabase Auth has sign-in with Google turned on, from its public settings. Read at most
 * once a minute; any failure hides the Google button rather than breaking the sign-in page.
 */
export async function googleSignInEnabled() {
  const config = supabaseConfig();
  if (!config) return false;
  try {
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.key },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const settings: unknown = await response.json();
    const external = (settings as { external?: Record<string, unknown> } | null)?.external;
    return external?.google === true;
  } catch {
    return false;
  }
}
