import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { DAILY_PRODUCT_LIMIT, PRODUCT_LIMIT } from "@/lib/moderation";
import { pageMetadata } from "@/lib/seo";
import { faqJsonLd, type FaqItem } from "@/lib/structured-data";
import { currentUser } from "@/lib/supabase/server";

// For founders deciding where to list a new SaaS, and for the search engines and AI assistants
// they ask. Every statement describes how the site works today.
export const metadata = pageMetadata({
  title: "List your SaaS for free",
  description:
    "Submit your SaaS for free: a public page, no review queue, and a dofollow link once your revenue is verified. New products without revenue are welcome.",
  path: "/list-your-saas",
});

const gains = [
  "A public page for your product with its logo, description, category, tech stack and a link to your website.",
  "A place in New arrivals, Browse and your category and technology pages as soon as you save it.",
  "A profile as the product's founder, where other users can write to you.",
  "Page views for your product's page, which only you see.",
  "A place on the leaderboard once you connect your payment provider and share your verified MRR.",
  "A badge for your own site that shows your verified MRR, or that your product is listed.",
];

const differences = [
  "Free, with no paid plans or upgrades.",
  "No review queue: your page is public as soon as you save it.",
  "No paid placements: the leaderboard is ordered by verified MRR, and equal amounts by the date the product was listed.",
  "Revenue is read from your payment provider through a read-only key, never typed in.",
  "The link to your website is followed by search engines (dofollow) once your revenue is verified, whether you share the figures or not. It is free.",
  "Search engines hear about your page at once: it joins the sitemap, and Bing and the other search engines that take IndexNow notices are told when you save it.",
];

const steps = [
  "Create an account with your email address and a username.",
  "Add your product: name, tagline, description, category, website, logo and tech stack. It is public when you save it.",
  "If you like, connect Stripe, Paddle, Polar or Dodo Payments with a read-only key to verify your MRR, and choose what to share.",
  "If you like, verify your domain with a DNS record and add the badge to your site.",
];

const questions: FaqItem[] = [
  {
    question: "Is it free to list a SaaS on The SaaS Harbor?",
    answer:
      "Yes. Listing, revenue verification, messages and the badge are free, and there are no paid plans.",
  },
  {
    question: "Can I list a product that has no revenue yet?",
    answer:
      "Yes. A product without a connected payment provider gets the same public page and appears in Browse, New arrivals and its category and technology pages. Only the leaderboard needs verified MRR.",
  },
  {
    question: "How long until my listing is public?",
    answer:
      "It is public as soon as you save it. There is no review queue; admins act on reports afterwards, as the terms describe.",
  },
  {
    question: "Do I have to share my revenue?",
    answer:
      "No. Verified MRR, paying customers and the launch date stay private until you choose to share each of them.",
  },
  {
    question: "Which payment providers can verify revenue?",
    answer:
      "Stripe, Paddle, Polar and Dodo Payments, one per product, through a key that can only read. Revenue is verified again every hour.",
  },
  {
    question: "Is the link to my website dofollow?",
    answer:
      "Yes, and for free, once your revenue is verified, whether you share the figures or not. Without verified revenue the link is marked nofollow.",
  },
  {
    question: "How many products can I list?",
    answer: `Up to ${PRODUCT_LIMIT} per account, and ${DAILY_PRODUCT_LIMIT} a day.`,
  },
  {
    question: "Can I remove my listing later?",
    answer:
      "Yes. You can delete a product, or your whole account, at any time, and everything that belongs to it goes with it.",
  },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="mt-3 leading-7 text-foreground/85">{children}</div>
    </section>
  );
}

function Checks({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <Check aria-hidden="true" className="mt-1.5 size-4 shrink-0 text-brand" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function ListYourSaas() {
  // Visitors create an account first; signed-in users go straight to the product form.
  const start = (await currentUser()) ? "/dashboard/saas/new" : "/auth?mode=signup";
  const actions = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <Button asChild size="lg">
        <Link href={start}>
          List your SaaS
          <ArrowRight />
        </Link>
      </Button>
      <Link href="/about" className="text-sm font-medium underline-offset-4 hover:underline">
        How it works
      </Link>
    </div>
  );
  return (
    <Shell size="narrow">
      <JsonLd data={faqJsonLd("/list-your-saas", "List your SaaS for free", questions)} />
      <PageHeader
        title="List your SaaS for free"
        description="The SaaS Harbor welcomes new products from day one. A listing is free, public as soon as you save it, and needs no revenue and no payment details."
      />
      {actions}
      <section
        aria-labelledby="dofollow"
        className="mt-8 rounded-xl border bg-surface p-5 leading-7"
      >
        <h2 id="dofollow" className="font-semibold">
          A free dofollow link, earned with verified revenue
        </h2>
        <p className="mt-1 text-foreground/85">
          Many directories charge for a followed link to your site. Here it is free: connect Stripe,
          Paddle, Polar or Dodo Payments with a read-only key, and the link from your product page
          is followed by search engines while your revenue stays verified. Your figures can stay
          private.
        </p>
      </section>
      <div className="mt-10 grid gap-10 border-t pt-10">
        <Section id="gains" title="What a listing gives">
          <Checks items={gains} />
        </Section>
        <Section id="new" title="Made for new SaaS">
          <p>
            Many directories order products by reviews, votes or paid placement, which a new product
            does not have yet. Here a new product gets the same page as an established one, and
            appears at the top of New arrivals when it joins.
          </p>
          <p className="mt-3">
            You do not need revenue to list. Once you have it, verifying it through your payment
            provider puts your product on the leaderboard and makes the link to your website one
            that search engines follow.
          </p>
        </Section>
        <Section id="differences" title="How it differs from other directories">
          <Checks items={differences} />
        </Section>
        <Section id="steps" title="How to list your SaaS">
          <ol className="grid list-decimal gap-2 pl-5 marker:text-faint-foreground">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Section>
        <Section id="questions" title="Common questions">
          <div className="grid gap-6">
            {questions.map(({ question, answer }) => (
              <div key={question}>
                <h3 className="font-medium text-foreground">{question}</h3>
                <p className="mt-1">{answer}</p>
              </div>
            ))}
          </div>
        </Section>
        <div className="grid gap-4">
          {actions}
          <p className="text-sm text-muted-foreground">
            Launching somewhere else too?{" "}
            <Link href="/where-to-launch" className="font-medium text-foreground underline">
              Where to launch your SaaS
            </Link>{" "}
            lists other places founders use, and what each is good for.
          </p>
        </div>
      </div>
    </Shell>
  );
}
