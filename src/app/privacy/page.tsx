import type { Metadata } from "next";
import Link from "next/link";
import {
  Contact,
  LegalList as List,
  LegalSection as Section,
  legalLink as link,
} from "@/components/legal";
import { Notice, PageHeader, Shell } from "@/components/shell";
import { operator, privacyUpdated } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What The SaaS Harbor stores about you, why, who can see it, and how to delete it.",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  const contact = <Contact />;
  return (
    <Shell size="narrow">
      <PageHeader
        title="Privacy policy"
        description="What The SaaS Harbor stores about you, why, who can see it, and how to delete it."
      />
      <div className="grid gap-10 border-t pt-10">
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">Last updated {privacyUpdated}.</p>
          {!operator && (
            <Notice>
              This policy is a draft. The name of the operator and a contact address for privacy
              requests are added before the site opens to the public.
            </Notice>
          )}
        </div>

        <Section id="responsible" title="Who is responsible">
          {operator ? (
            <p>
              The SaaS Harbor is run by {operator.name}, which is responsible for the personal data
              described here. For privacy questions and requests, email {contact}.
            </p>
          ) : (
            <p>
              The name of the operator, who is responsible for the personal data described here, and
              a contact address for privacy questions will be listed here.
            </p>
          )}
        </Section>

        <Section id="data" title="What we store">
          <List>
            <li>
              <strong className="font-medium text-foreground">Account.</strong> Your email address
              and your password, which is stored only as a salted hash. We also record account
              events, such as sign-ins, with their time and IP address, to keep accounts secure.
            </li>
            <li>
              <strong className="font-medium text-foreground">Maker profile.</strong> Your name,
              headline, location, About text, experience, skills, links and photo, and the page
              address made from your name. You decide what to fill in.
            </li>
            <li>
              <strong className="font-medium text-foreground">Products.</strong> Name, tagline,
              description, category, website, logo and launch date.
            </li>
            <li>
              <strong className="font-medium text-foreground">Stripe verification.</strong> If you
              connect Stripe: the restricted key you paste, stored encrypted, and the result of each
              verification. That is your monthly recurring revenue, the number of paying customers,
              totals per currency, revenue at each of the last twelve month-ends, and one-way hashes
              of subscription IDs, which stop one Stripe account from verifying two products.
            </li>
            <li>
              <strong className="font-medium text-foreground">Messages.</strong> The messages you
              send and receive, how far you have read each conversation, and the makers you block.
            </li>
            <li>
              <strong className="font-medium text-foreground">Reports and moderation.</strong> When
              you report something: the reason, your explanation and a copy of what you reported,
              which for a message is its text and time. When an admin decides about your product or
              account: the decision, its reason and explanation, when it was made and by which
              admin.
            </li>
            <li>
              <strong className="font-medium text-foreground">Email notifications.</strong> Which
              emails you want, emails waiting to be sent to you, and a record of sent ones. A
              message email names the sender but never contains the message.
            </li>
            <li>
              <strong className="font-medium text-foreground">Preferences.</strong> Whether you
              chose the light or dark theme, in a cookie on your device.
            </li>
          </List>
        </Section>

        <Section id="stripe" title="What we read from Stripe">
          <p>
            With the key you provide, our server reads subscriptions, invoices, coupons and prices
            from your Stripe account. It only reads and never changes anything in Stripe.
          </p>
          <p>
            Invoices can include your customers&apos; names and email addresses. We use only
            amounts, currencies, dates and plan details to calculate the figures above, and we never
            store or log details about your customers.
          </p>
          <p>
            Disconnecting Stripe deletes the stored key at once. Earlier verification results stay
            in your private history until you delete the product or your account. You can also
            delete the key in Stripe under{" "}
            <span className="whitespace-nowrap">Developers → API keys</span>.
          </p>
        </Section>

        <Section id="purposes" title="Why we use it">
          <List>
            <li>
              To run your account and publish the maker profile and products you create. This is the
              service you sign up for (performance of a contract, GDPR Article 6(1)(b)).
            </li>
            <li>
              To verify revenue through Stripe when you connect it, and show the figures you choose
              to share. This is part of the same service (Article 6(1)(b)).
            </li>
            <li>
              To deliver the messages you send to other makers, and to email you about unread
              messages, also part of the service (Article 6(1)(b)). You can turn message emails off.
            </li>
            <li>
              To keep the service secure and fair, through the sign-in records, the subscription
              hashes described above, and limits on how many messages, reports and products an
              account can add and how often it checks Stripe. The limits keep the times you added a
              product for a day and the times you checked Stripe for an hour (our legitimate
              interests, Article 6(1)(f)).
            </li>
            <li>
              To handle reports and moderate the site. The EU Digital Services Act requires us to
              act on reports of illegal content and to explain our decisions (a legal obligation,
              Article 6(1)(c)). Other reports and decisions keep the site safe for its users (our
              legitimate interests, Article 6(1)(f)).
            </li>
          </List>
          <p>We do not sell data, show ads, or use analytics or tracking of any kind.</p>
        </Section>

        <Section id="visibility" title="Who can see it">
          <List>
            <li>
              <strong className="font-medium text-foreground">Everyone:</strong> your maker profile,
              your products and their logos, and the verified figures you choose to share. Sharing
              MRR also shows its month-end history and 30-day growth. Paying customers and the
              launch date each have their own setting.
            </li>
            <li>
              <strong className="font-medium text-foreground">Only you:</strong> your Stripe
              connection status, your verification history and any figures you keep private. Stored
              Stripe keys are never shown, not even to you.
            </li>
            <li>
              <strong className="font-medium text-foreground">The two of you:</strong> a
              conversation and its messages are visible only to the two makers in it. A block is
              visible only to the maker who made it. Messages are not end-to-end encrypted, so
              people who run the site&apos;s systems could technically access them; we only do so
              when the law requires it.
            </li>
            <li>
              <strong className="font-medium text-foreground">Admins:</strong> the people the
              operator appoints to review reports. They see your email address, when you joined and
              last signed in, reports about you or by you, and the decisions about your account. An
              admin sees a private message only when one of the two makers reports it, and then only
              a copy of that message. A maker who is reported never learns who reported them.
            </li>
            <li>
              <strong className="font-medium text-foreground">Service providers:</strong> our
              hosting, database and email providers process data on our behalf to run the site.
              Account emails, such as confirmation and password reset messages, and notification
              emails are sent through our email provider. If a provider handles data outside the EU
              or EEA, we use the safeguards the GDPR requires, such as the EU standard contractual
              clauses.
            </li>
          </List>
          <p>
            Exchange rates for other currencies come from a public service. Those requests contain
            only currency codes.
          </p>
        </Section>

        <Section id="cookies" title="Cookies">
          <p>
            We only use cookies the site needs: sign-in cookies that keep you signed in, and a theme
            cookie that remembers light or dark mode. There are no advertising or analytics cookies.
          </p>
        </Section>

        <Section id="retention" title="How long we keep it">
          <p>
            We keep your data for as long as you have an account. When you delete your account, your
            profile, products, images, Stripe keys, verification history, conversations and sign-in
            records are deleted right away. A conversation is deleted for both makers when either of
            them deletes their account. Deleting a single product removes its details, its logo, its
            Stripe key and its verification history in the same way. Logos and photos you replaced
            earlier are kept until you delete your account. Copies in backups disappear when those
            backups expire.
          </p>
          <p>
            An email waits in a queue until it is sent, and a record of it is kept for a week
            afterwards, then deleted. The notices that update an open conversation live hold only
            ids and are deleted within a few days; deleting your account deletes the ones about you
            at once, as well as emails queued to others about your messages.
          </p>
          <p>
            A report is deleted when either the maker who sent it or the maker it is about deletes
            their account. Deleting a reported product or message keeps the report and its copy, so
            admins can still review it. Admin decisions are deleted with the account they concern.
          </p>
          <p>
            Information that was public may already have been copied by others, such as search
            engines, before it was deleted.
          </p>
        </Section>

        <Section id="rights" title="Your rights">
          <p>
            You can see and change your profile and products at any time in your dashboard, follow
            the reports you sent under{" "}
            <Link className={link} href="/dashboard/reports">
              Your reports
            </Link>
            , choose which emails you get under{" "}
            <Link className={link} href="/dashboard/settings">
              Email settings
            </Link>
            , delete a product at the bottom of its editor, and delete your account yourself under{" "}
            <Link className={link} href="/dashboard/profile#delete-account">
              Maker profile → Delete account
            </Link>
            .
          </p>
          <p>
            Under the GDPR you also have the right to access your data, have it corrected, erased or
            moved to another service, restrict how it is used, and object to use based on our
            legitimate interests. To use these rights, write to {contact}. You can also complain to
            a data protection authority, for example in the country where you live or work.
          </p>
        </Section>

        <Section id="changes" title="Changes to this policy">
          <p>
            When this policy changes, we update the date at the top. We will email registered makers
            about changes that affect how we use data they have already given us.
          </p>
        </Section>
      </div>
    </Shell>
  );
}
