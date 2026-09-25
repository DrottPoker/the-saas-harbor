import { PersonAvatar, ProductLogo } from "../avatars";
import { LocalTime } from "../local-time";

type Content = Record<string, unknown>;
const text = (content: Content, key: string) =>
  typeof content[key] === "string" ? (content[key] as string) : "";

// Links in reported content are shown as text, so an admin never opens them by accident.
function Details({ rows }: { rows: [string, string][] }) {
  const shown = rows.filter(([, value]) => value);
  if (!shown.length) return null;
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
      {shown.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="[overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The copy of a product, profile or message that was stored when it was reported. */
export function ReportedContent({ target, content }: { target: string; content: unknown }) {
  const copy = (content ?? {}) as Content;
  if (target === "message") {
    const sent = text(copy, "sent_at");
    return (
      <figure className="grid gap-2">
        <blockquote className="w-fit max-w-full rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {text(copy, "body")}
        </blockquote>
        {sent && (
          <figcaption className="text-[13px] text-muted-foreground">
            Sent <LocalTime value={sent} />
          </figcaption>
        )}
      </figure>
    );
  }
  if (target === "saas") {
    const name = text(copy, "name");
    return (
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          <ProductLogo path={text(copy, "logo_path") || null} name={name || "?"} size="lg" />
          <div className="min-w-0">
            <p className="font-semibold [overflow-wrap:anywhere]">{name}</p>
            <p className="text-sm text-muted-foreground">{text(copy, "tagline")}</p>
          </div>
        </div>
        <Details
          rows={[
            ["Category", text(copy, "category")],
            ["Website", text(copy, "website")],
          ]}
        />
        <p className="text-sm leading-6 whitespace-pre-wrap text-foreground/85 [overflow-wrap:anywhere]">
          {text(copy, "description")}
        </p>
      </div>
    );
  }
  const name = text(copy, "name");
  const skills = Array.isArray(copy.skills) ? copy.skills.filter((s) => typeof s === "string") : [];
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <PersonAvatar path={text(copy, "avatar_path") || null} name={name || "?"} size="lg" />
        <div className="min-w-0">
          <p className="font-semibold [overflow-wrap:anywhere]">{name}</p>
          {text(copy, "headline") && (
            <p className="text-sm text-muted-foreground">{text(copy, "headline")}</p>
          )}
        </div>
      </div>
      {text(copy, "bio") && (
        <p className="text-sm leading-6 whitespace-pre-wrap text-foreground/85 [overflow-wrap:anywhere]">
          {text(copy, "bio")}
        </p>
      )}
      <Details
        rows={[
          ["Location", text(copy, "location")],
          ["Website", text(copy, "website")],
          ["LinkedIn", text(copy, "linkedin_url")],
          ["GitHub", text(copy, "github_url")],
          ["X", text(copy, "x_url")],
          ["Other link", text(copy, "social_url")],
          ["Skills", skills.join(", ")],
        ]}
      />
    </div>
  );
}
