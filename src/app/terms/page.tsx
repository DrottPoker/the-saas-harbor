import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalList, LegalSection, legalLink } from "@/components/legal";
import { Notice, PageHeader, Shell } from "@/components/shell";
import { operator, termsUpdated } from "@/lib/legal";
import { DAILY_PRODUCT_LIMIT, PRODUCT_LIMIT } from "@/lib/moderation";

export const metadata: Metadata = {
  title: "Terms",
  description: "The rules for using The SaaS Harbor, and how reports and moderation work.",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  return (
    <Shell size="narrow">
      <PageHeader
        title="Terms"
        description="The rules for using The SaaS Harbor, and how reports and moderation work."
      />
      <div className="grid gap-10 border-t pt-10">
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">Last updated {termsUpdated}.</p>
          {!operator.email && (
            <Notice>
              A contact address for questions, reports from people without an account, and appeals
              will be published here soon.
            </Notice>
          )}
        </div>

        <LegalSection id="about" title="About these terms">
          <p>
            These terms apply when you use The SaaS Harbor, which is run by {operator.name}. By
            creating an account you agree to them. The{" "}
            <Link className={legalLink} href="/privacy">
              privacy policy
            </Link>{" "}
            explains what we store about you and why.
          </p>
        </LegalSection>

        <LegalSection id="account" title="Your account">
          <LegalList>
            <li>You need to be at least 18 years old to create an account.</li>
            <li>
              Use your own name, or the name you are known by, and keep your email address up to
              date.
            </li>
            <li>
              Keep your password to yourself. You are responsible for what is done with your
              account.
            </li>
            <li>
              You can delete your account at any time under{" "}
              <Link className={legalLink} href="/dashboard/profile#delete-account">
                Profile → Delete account
              </Link>
              .
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection id="content" title="What you publish">
          <p>
            Your products, profile and messages stay yours. You must have the right to publish them,
            including logos and photos. By publishing a product or a profile, you let us show it on
            the site for as long as it is published.
          </p>
          <p>
            Only list products you run or are allowed to represent. An account can list up to{" "}
            {PRODUCT_LIMIT} products and add up to {DAILY_PRODUCT_LIMIT} a day.
          </p>
        </LegalSection>

        <LegalSection id="rules" title="What is not allowed">
          <LegalList>
            <li>
              Illegal content, such as fraud or material that infringes someone&apos;s rights.
            </li>
            <li>Spam and unsolicited advertising, in listings as well as in messages.</li>
            <li>Misleading or false information about a product or a person.</li>
            <li>
              Pretending to be someone else, or using their name, brand or work without permission.
            </li>
            <li>Harassment, threats or hateful content aimed at a person or a group.</li>
            <li>
              Manipulating revenue verification or the leaderboard, for example with fake
              subscriptions or a payment provider account that belongs to another business.
            </li>
            <li>
              Trying to reach other users&apos; accounts or data, collecting it for spam, or
              disrupting the site.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection id="revenue" title="Verified revenue">
          <p>
            Revenue figures come from your payment provider through a read-only key you provide, and
            are calculated as described in{" "}
            <Link className={legalLink} href="/about">
              How it works
            </Link>
            . We may hide figures we have reason to believe were manipulated. The figures are
            information, not a guarantee and not investment advice.
          </p>
        </LegalSection>

        <LegalSection id="messages" title="Messages">
          <p>
            Messages are private between two users. You can block a user, and limits stop an account
            from sending too many messages. Do not use messages for advertising people did not ask
            for.
          </p>
        </LegalSection>

        <LegalSection id="moderation" title="Reports and moderation">
          <p>
            Signed-in users can report a product, a profile or a message they received with the
            Report link next to it. Anyone else can write to <Contact />.
          </p>
          <p>
            Admins appointed by the operator review every report themselves. Nothing is decided
            automatically. When something breaks these terms or the law, an admin can:
          </p>
          <LegalList>
            <li>
              <strong className="font-medium text-foreground">Hide a product.</strong> It is no
              longer shown anywhere on the site.
            </li>
            <li>
              <strong className="font-medium text-foreground">Suspend an account.</strong> The
              profile and products are hidden, and the account cannot send messages or reports. The
              user can still sign in, edit their products and delete the account.
            </li>
          </LegalList>
          <p>
            The user concerned sees the decision, the reason and an explanation in their dashboard,
            but not who reported. Reporters see the outcome of their reports under Dashboard → Your
            reports. Admins may also act on problems they find without a report.
          </p>
          <p>
            If you disagree with a decision, write to <Contact /> and say why. We will look at the
            decision again and reply.
          </p>
        </LegalSection>

        <LegalSection id="changes" title="Changes and availability">
          <p>
            We run the site with care, but cannot promise that it is always available or free of
            errors, and we may change or stop features. When these terms change, we update the date
            at the top and tell registered users about changes that affect them before they apply.
          </p>
        </LegalSection>

        <LegalSection id="contact" title="Contact">
          <p>
            Questions about these terms, reports and appeals go to <Contact />.
          </p>
        </LegalSection>
      </div>
    </Shell>
  );
}
