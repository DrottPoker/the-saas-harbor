import { Briefcase, Globe, GraduationCap, Link2 } from "lucide-react";
import type { Profile } from "@/lib/data";
import { entryPeriod, openToLabel, sortEntries, type ProfileEntry } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { GitHubIcon, LinkedInIcon, XIcon } from "./brand-icons";

export function ProfileCard({
  title,
  id,
  className,
  children,
}: {
  title: string;
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("rounded-xl border bg-surface p-5 sm:p-6", className)}
    >
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ProfileLinks({ profile, className }: { profile: Profile; className?: string }) {
  const links = [
    { href: profile.website, label: hostname(profile.website), Icon: Globe },
    { href: profile.linkedin_url, label: "LinkedIn", Icon: LinkedInIcon },
    { href: profile.github_url, label: "GitHub", Icon: GitHubIcon },
    { href: profile.x_url, label: "X", Icon: XIcon },
    { href: profile.social_url, label: hostname(profile.social_url), Icon: Link2 },
  ].filter((link) => link.href);
  if (!links.length) return null;
  return (
    <ul aria-label="Links" className={cn("flex flex-wrap gap-x-5 gap-y-2 text-sm", className)}>
      {links.map(({ href, label, Icon }) => (
        <li key={href}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1.5 font-medium hover:underline"
          >
            <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** What the maker is looking for, highlighted like LinkedIn's "Open to" box. */
export function OpenTo({ name, values }: { name: string; values: string[] }) {
  return (
    <section
      aria-labelledby="open-to"
      className="rounded-xl border border-brand/25 bg-brand-soft p-5 sm:p-6"
    >
      <h2 id="open-to" className="font-semibold">
        Open to
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {name} is happy to hear from makers about:
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {values.map((value) => (
          <li
            key={value}
            className="rounded-full border border-brand/25 bg-surface px-3 py-1 text-sm font-medium"
          >
            {openToLabel(value)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EntryList({ entries }: { entries: ProfileEntry[] }) {
  return (
    <ol className="divide-y">
      {sortEntries(entries).map((entry) => {
        const Icon = entry.kind === "education" ? GraduationCap : Briefcase;
        return (
          <li key={entry.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground"
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <h3 className="font-medium">{entry.title}</h3>
              <p className="text-sm">{entry.organization}</p>
              <p className="text-sm text-muted-foreground">{entryPeriod(entry)}</p>
              {entry.description && (
                <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-foreground/85">
                  {entry.description}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Skills({ skills }: { skills: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {skills.map((skill) => (
        <li key={skill} className="rounded-full border bg-subtle px-3 py-1 text-sm">
          {skill}
        </li>
      ))}
    </ul>
  );
}
