import { Briefcase, Globe, Link2 } from "lucide-react";
import type { Profile } from "@/lib/data";
import { rolePeriod, sortRoles, type ProfileExperience } from "@/lib/profile";
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
  const links = [
    { label: "Website", href: profile.website, text: hostname(profile.website), Icon: Globe },
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
    { label: "Link", href: profile.social_url, text: hostname(profile.social_url), Icon: Link2 },
  ].filter((link) => link.href);
  if (!links.length) return null;
  return (
    <dl className="grid gap-3 rounded-xl border bg-surface p-5 text-sm">
      {links.map(({ label, href, text, Icon }) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </dt>
          <dd className="min-w-0 truncate text-right">
            <a
              href={href}
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

export function RoleList({ roles }: { roles: ProfileExperience[] }) {
  return (
    <ol className="divide-y rounded-xl border bg-surface">
      {sortRoles(roles).map((role) => (
        <li key={role.id} className="flex gap-4 p-5">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground"
          >
            <Briefcase className="size-5" />
          </span>
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <h3 className="font-medium">{role.title}</h3>
            <p className="text-sm">{role.organization}</p>
            <p className="text-sm text-muted-foreground">{rolePeriod(role)}</p>
            {role.description && (
              <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-foreground/85">
                {role.description}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Skills({ skills }: { skills: string[] }) {
  return (
    <section aria-labelledby="skills" className="rounded-xl border bg-surface p-5">
      <h2 id="skills" className="text-sm text-muted-foreground">
        Skills
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {skills.map((skill) => (
          <li key={skill} className="rounded-full border bg-subtle px-3 py-1 text-sm">
            {skill}
          </li>
        ))}
      </ul>
    </section>
  );
}
