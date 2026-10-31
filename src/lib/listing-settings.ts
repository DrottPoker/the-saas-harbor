import "server-only";
import { cache } from "react";
import { publicClient } from "./supabase/server";

/** The public listing policy, shared by the form and the listing instructions. */
export const listingSettings = cache(async () => {
  const client = publicClient();
  if (!client) return { allowOtherProvider: true };
  const { data, error } = await client.rpc("listing_settings");
  if (error || data === null) throw new Error("Listing settings could not be loaded.");
  return { allowOtherProvider: data };
});
