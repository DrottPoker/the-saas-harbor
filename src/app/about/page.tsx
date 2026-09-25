import Link from "next/link";
import { demoActive } from "@/lib/data";
import { PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";

export const metadata = { title: "How it works", alternates: { canonical: "/about" } };

const sections = [
  {
    title: "Verified revenue",
    body: [
      "Revenue is never typed in by makers. Each product connects its Stripe account with a restricted key that can only read subscriptions, invoices, coupons and prices. The key is encrypted when stored, used only by our server to read data, and can be revoked in Stripe at any time.",
      "Monthly recurring revenue (MRR) is calculated from active and past-due subscriptions, normalized to one month, after ongoing discounts and before tax. Trials, paused subscriptions, one-time discounts and usage-based charges are not counted. Other currencies are converted to US dollars with daily central-bank reference rates. Paying customers are the customers with a subscription worth more than zero.",
      "Verification runs again every day. A figure that has not been verified for seven days is hidden and removed from the leaderboard, so a revoked key cannot keep an old number on display. A Stripe account can only verify one product.",
    ],
  },
  {
    title: "The leaderboard",
    body: [
      "Products are ranked by verified MRR that their makers choose to share. Equal amounts are ordered by the date the product was listed. Category filters keep the overall rank, and a verified MRR of $0 is ranked too.",
      "Products without Stripe, or that keep their revenue private, are still listed in Browse and New arrivals.",
    ],
  },
  {
    title: "Demo products",
    demo: true,
    body: [
      "While the directory is new, the leaderboard, Browse and New arrivals show demo products after the real ones, so you can see what a listing looks like. They are marked Demo, and the products, their makers and their figures are made up. They are never ranked or verified, cannot be contacted, and disappear as real products join.",
    ],
  },
  {
    title: "What is public",
    body: [
      "Product details, maker profiles, logos and photos are public. Verified MRR, paying customers and launch date are private by default, each with its own sharing setting. Sharing MRR also shows its month-end history and 30-day growth; the full verification history is visible only to the maker. Information that was public before may already have been copied by others.",
      <>
        Makers can delete a product, or their whole account with everything in it, at any time. The{" "}
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
        Makers can report a product, a profile or a message they received. Admins review every
        report themselves and can hide a product or suspend an account. The maker then sees the
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
      "The SaaS Harbor is a directory and leaderboard where makers can also write to each other privately. There are no sales, deal rooms or payments here.",
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
        description="A public directory of independent SaaS, with a leaderboard of revenue verified through Stripe."
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
            <Link href="/dashboard/saas/new">Submit your SaaS</Link>
          </Button>
        </div>
      </div>
    </Shell>
  );
}
