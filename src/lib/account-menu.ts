import "server-only";
import { cache } from "react";
import { isAdmin } from "./admin";
import { currentUser, serverClient } from "./supabase/server";

/** What the account menu in the header shows for the signed-in user. */
export type AccountMenuData = {
  id: string;
  name: string;
  /** The username, or null when the profile could not be read. */
  slug: string | null;
  avatarPath: string | null;
  /** A suspended account's public profile is hidden, from its owner too. */
  suspended: boolean;
  /** Signed in through Google or GitHub, but no username chosen yet. */
  unfinished: boolean;
  sentReports: boolean;
  /** Open reports for admins, null for everyone else. */
  openReports: number | null;
};

// Once per request. A failure never breaks the page: the menu then shows the email address.
export const accountMenu = cache(async (): Promise<AccountMenuData | null> => {
  const user = await currentUser();
  if (!user) return null;
  const client = await serverClient();
  const [profile, reports, admin] = await Promise.all([
    client
      .from("profiles")
      .select("name, slug, avatar_path, suspended_at")
      .eq("id", user.id)
      .maybeSingle(),
    client.from("reports").select("id", { count: "exact", head: true }).eq("reporter_id", user.id),
    isAdmin(),
  ]);
  const openReports = admin
    ? ((
        await client
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "open")
      ).count ?? 0)
    : null;
  return {
    id: user.id,
    name: profile.data?.name ?? user.email ?? "Account",
    slug: profile.data?.slug ?? null,
    avatarPath: profile.data?.avatar_path ?? null,
    suspended: !!profile.data?.suspended_at,
    unfinished: !profile.error && !profile.data,
    sentReports: !!reports.count,
    openReports,
  };
});
