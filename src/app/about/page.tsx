import Link from "next/link";
import { demoActive } from "@/lib/data";
import { PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "How it works",
  description:
    "How The SaaS Harbor verifies MRR with read-only keys to Stripe, Paddle, Polar and Dodo Payments, how the leaderboard is ranked, and what is public.",
  path: "/about",
});

const sections = [
  {
    title: "Verified revenue",
    body: [
      "Revenue is never typed in by founders. Each product connects its payment provider, Stripe, Paddle, Polar or Dodo Payments, with a key that can only read: subscriptions and what was charged for them. The key is encrypted when stored, used only by our server to read data, and can be revoked with the provider at any time.",
      "Monthly recurring revenue (MRR) is calculated the same way for every provider: active and past-due subscriptions, normalized to one month, after ongoing discounts and before tax. Trials, paused subscriptions, one-time discounts and usage-based charges are not counted. With Stripe each subscription is valued by its prices and discounts. Paddle bills in local prices and currencies, so a Paddle subscription is valued by its latest charge for a full period. Polar and Dodo Payments give each subscription its recurring amount, and where it includes tax, the tax is taken out at the share its latest payment shows. Other currencies are converted to US dollars with daily central-bank reference rates. Paying customers are the customers with a subscription worth more than zero.",
      "Verification runs again every hour, and the history and 30-day growth once a day. A figure that has not been verified for seven days is hidden and removed from the leaderboard, so a revoked key cannot keep an old number on display. The history and 30-day growth come from paid charges; Dodo Payments does not say which period a payment covers, so its products have no history. A payment provider account can only verify one product.",
    ],
  },
  {
    title: "The leaderboard",
    body: [
      "Products are ranked by verified MRR that their founders choose to share. Equal amounts are ordered by the date the product was listed. Category filters keep the overall rank, and a verified MRR of $0 is ranked too.",
      "Products without a connected payment provider, or that keep their revenue private, are still listed in Browse and New arrivals.",
      "The statistics page adds up the same figures: combined and median MRR, how MRR is spread, the change over 30 days, and the figures by category and by time since launch. It shows them once five products share verified MRR.",
    ],
  },
  {
    title: "Links to your website",
    body: [
      "Each product page links to the product's website. While the product's revenue is verified, whether its figures are shared or private, the link is not marked nofollow, so search engines can follow it and count it for your site. Without verified revenue the link is marked nofollow.",
      "Visitors who follow the link show up in your own analytics as coming from The SaaS Harbor.",
    ],
  },
  {
    title: "Tech stacks",
    body: [
      "Founders list the technologies a product is built with, and each technology has a page with the products built with it.",
    ],
  },
  {
    title: "Verified domains",
    body: [
      "A founder can show that the product's website is theirs: they add a DNS record with a code for the product to the website's domain, and the product page then shows the domain as verified. Verifying is optional; other products show Not verified. The record is looked up again every day. When it has been missing for three days, or the website moves to another domain, the product is no longer marked.",
    ],
  },
  {
    title: "Demo products",
    demo: true,
    body: [
      "While the directory is new, the leaderboard, Browse and New arrivals show demo products after the real ones, so you can see what a listing looks like. Their figures are listed as Demo MRR, their pages are marked Demo, and the products, their founders and their figures are made up. They are never ranked or verified, cannot be contacted, and disappear as real products join.",
    ],
  },
  {
    title: "What is public",
    body: [
      "Product details, user profiles, logos and photos are public. Verified MRR, paying customers and launch date are private by default, each with its own sharing setting. Sharing MRR also shows its month-end history and 30-day growth; the full verification history is visible only to the founder. Information that was public before may already have been copied by others.",
      <>
        Users can delete their products, or their whole account with everything in it, at any time.
        The{" "}
        <Link className="font-medium text-foreground underline" href="/privacy">
          privacy policy
        </Link>{" "}
        describes what is stored and why.
      </>,
    ],
  },
  {
    title: "Reports and moderation",
    body: [
      <>
        Users can report a product, a profile or a message they received. Admins review every report
        themselves and can hide a product or suspend an account. The user concerned then sees the
        reason in their dashboard, but never who reported. The{" "}
        <Link className="font-medium text-foreground underline" href="/terms">
          terms
        </Link>{" "}
        list what is not allowed.
      </>,
    ],
  },
  {
    title: "What this is not",
    body: [
      "The SaaS Harbor is a directory and leaderboard where users can also write to each other privately. There are no sales, deal rooms or payments here.",
    ],
  },
];

export default async function About() {
  // The demo section is shown only while demo products are.
  const demo = await demoActive();
  return (
    <Shell size="narrow">
      <PageHeader
        title="How The SaaS Harbor works"
        description="A public directory of independent SaaS, with a leaderboard of revenue verified through each product's payment provider."
      />
      <div className="grid gap-10 border-t pt-10">
        {sections
          .filter((section) => demo || !("demo" in section))
          .map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              {section.body.map((paragraph, index) => (
                <p key={index} className="mt-3 leading-7 text-foreground/85">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        <div>
          <Button asChild>
            <Link href="/dashboard/saas/new">List your SaaS</Link>
          </Button>
        </div>
      </div>
    </Shell>
  );
}
