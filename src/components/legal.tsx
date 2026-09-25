import { operator } from "@/lib/legal";

// Building blocks for the privacy policy and the terms.
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="mt-3 grid gap-3 leading-7 text-foreground/85">{children}</div>
    </section>
  );
}

export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul className="grid list-disc gap-2 pl-5 marker:text-faint-foreground">{children}</ul>;
}

export const legalLink = "font-medium text-foreground underline underline-offset-2";

/** The operator's contact address as a link, or a placeholder while the policy is a draft. */
export function Contact({ className = legalLink }: { className?: string }) {
  return operator ? (
    <a className={className} href={`mailto:${operator.email}`}>
      {operator.email}
    </a>
  ) : (
    <>the operator&apos;s contact address, once it is published</>
  );
}
