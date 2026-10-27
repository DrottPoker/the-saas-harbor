import { Globe, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Profile } from "@/lib/data";
import { GitHubIcon, LinkedInIcon, XIcon } from "./brand-icons";

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// The last part of a profile address, such as "lena" for https://www.linkedin.com/in/lena.
function handle(url: string) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? hostname(url);
  } catch {
    return url;
  }
}

/** Links with their icons, in the same card as a product's details. */
export function ProfileDetails({ profile }: { profile: Profile }) {
  const t = useTranslations("profile.details");
  // Brand names stay as they are; addresses and handles read left to right in every language.
  const links = [
    { label: t("website"), href: profile.website, text: hostname(profile.website), Icon: Globe },
    {
      label: "LinkedIn",
      href: profile.linkedin_url,
      text: handle(profile.linkedin_url),
      Icon: LinkedInIcon,
    },
    {
      label: "GitHub",
      href: profile.github_url,
      text: handle(profile.github_url),
      Icon: GitHubIcon,
    },
    { label: "X", href: profile.x_url, text: `@${handle(profile.x_url)}`, Icon: XIcon },
    { label: t("link"), href: profile.social_url, text: hostname(profile.social_url), Icon: Link2 },
  ].filter((link) => link.href);
  if (!links.length) return null;
  return (
    <dl className="grid gap-3 rounded-xl border bg-surface p-5 text-sm shadow-card">
      {links.map(({ label, href, text, Icon }) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </dt>
          <dd className="min-w-0 truncate text-end">
            <a
              href={href}
              dir="ltr"
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="hover:underline"
            >
              {text}
            </a>
          </dd>
        </div>
      ))}
    </dl>
  );
}
