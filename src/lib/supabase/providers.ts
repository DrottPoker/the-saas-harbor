import "server-only";
import { cache } from "react";
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/auth";
import { supabaseConfig } from "./config";

/**
 * The sign-in providers Supabase Auth has turned on, from its public settings. Read at most once a
 * minute; any failure hides the buttons rather than breaking the sign-in page.
 */
export const enabledProviders = cache(async (): Promise<OAuthProvider[]> => {
  const config = supabaseConfig();
  if (!config) return [];
  try {
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.key },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];
    const settings: unknown = await response.json();
    const external = (settings as { external?: Record<string, unknown> } | null)?.external;
    return OAUTH_PROVIDERS.filter((provider) => external?.[provider] === true);
  } catch {
    return [];
  }
});
