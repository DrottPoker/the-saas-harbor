import { Contact, LegalList as List, LegalSection as Section } from "@/components/legal";
import { PageHeader, Shell } from "@/components/shell";
import { legalDate, operator, privacyUpdated } from "@/lib/legal";
import { providerList } from "@/lib/revenue/catalog";
import { pageMetadata } from "@/lib/seo";

const description =
  "What The SaaS Harbor stores about you, why, who can see it, and how to delete it.";

export const metadata = pageMetadata({ title: "Privacy policy", description, path: "/privacy" });

// The policy describes how the service handles personal data today, without promises about how
// it will work, so it can follow the service as it changes.
export default function Privacy() {
  // Sentences that name the contact address show once it is set in src/lib/legal.ts.
  const contact = operator.email && <Contact />;
  return (
    <Shell size="narrow">
      <PageHeader title="Privacy policy" description={description} />
      <div className="grid gap-10 border-t pt-10">
        <p className="text-sm text-muted-foreground">Last updated {legalDate(privacyUpdated)}.</p>

        <Section id="responsible" title="Who is responsible">
          <p>
            The SaaS Harbor is run by {operator.name}, which is responsible for the personal data
            described here.
            {contact && <> For privacy questions and requests, write to {contact}.</>}
          </p>
        </Section>

        <Section id="data" title="What we store">
          <List>
            <li>
              <strong className="font-medium text-foreground">Account.</strong> Your email address,
              your password as a salted hash, which version of the Terms of Service you accepted and
              when, account events such as sign-ins with their time and IP address, and the country
              of your latest sign-in.
            </li>
            <li>
              <strong className="font-medium text-foreground">
                Sign-in with Google or GitHub.
              </strong>{" "}
              If you sign in with Google or GitHub, that service sends us your account ID there,
              email address, name and the address of your profile picture, and for GitHub your
              username. They are stored with your account and used to sign you in.
            </li>
            <li>
              <strong className="font-medium text-foreground">Profile.</strong> Your username, which
              is also your page address, the details you add, such as your name, headline, location,
              About text, experience, skills, links and photo, and when you last changed your
              username.
            </li>
            <li>
              <strong className="font-medium text-foreground">Products.</strong> The details you
              add, such as name, tagline, description, category, website, logo, tech stack and
              launch date, and for a product&apos;s domain, the domain, its DNS record and when it
              was checked.
            </li>
            <li>
              <strong className="font-medium text-foreground">Revenue verification.</strong> Which
              payment provider you connect ({providerList("or")}), the key you provide or the access
              you grant, and the account details it needs, stored encrypted, and the results of
              verification, such as monthly recurring revenue, paying customers, totals per
              currency, revenue history and revenue over time. For each payment we store what it
              earned, its currency, the day it was paid and whether it paid for a subscription,
              without who paid it. One-way hashes of subscription, payment or project IDs stop one
              account from verifying two products.
            </li>
            <li>
              <strong className="font-medium text-foreground">Milestones.</strong> The MRR amounts
              and leaderboard places your products reach, and when.
            </li>
            <li>
              <strong className="font-medium text-foreground">Messages.</strong> The messages you
              send and receive, how far you have read each conversation, and the users you block.
            </li>
            <li>
              <strong className="font-medium text-foreground">Reports and moderation.</strong> The
              reports you send, with a copy of what you reported, and decisions about your products
              or account, with their reasons.
            </li>
            <li>
              <strong className="font-medium text-foreground">Feedback.</strong> What you send as
              feedback, the page you sent it from, and whether it has been handled. Without an
              account, you may also leave an email address for a reply, and we keep the day&apos;s
              hash of your IP address and browser, as for the site statistics, to limit how much
              feedback one visitor sends.
            </li>
            <li>
              <strong className="font-medium text-foreground">Emails.</strong> Which emails you
              want, and a record of the emails sent to you.
            </li>
            <li>
              <strong className="font-medium text-foreground">Visits.</strong> Statistics about
              visits to the site (see Site statistics).
            </li>
            <li>
              <strong className="font-medium text-foreground">How you found the site.</strong> When
              you create an account, where the visit that led to it came from, such as the site or
              app that linked to it, its campaign tags and its first page.
            </li>
            <li>
              <strong className="font-medium text-foreground">How you use the service.</strong> What
              follows from the data above, such as when you confirmed your email address, listed a
              product or verified revenue.
            </li>
            <li>
              <strong className="font-medium text-foreground">Preferences.</strong> Whether you
              chose the light or dark theme, in a cookie on your device.
            </li>
          </List>
        </Section>

        <Section id="revenue" title="What we read from your payment provider">
          <p>
            With the key you provide or the access you grant, our server reads what it needs to
            verify revenue from the account you connect, such as subscriptions, invoices, payments,
            transactions, sales, refunds, disputes, products, prices, discounts and plans, depending
            on the provider. These records can include details about your customers, such as names,
            email addresses and countries. We use the records to calculate the figures described
            above, and do not store your customers&apos; details.
          </p>
          <p>
            Disconnecting deletes the stored key or access. Earlier verification results stay in
            your private history until you delete the product or your account. You can also revoke
            the key or access with your payment provider.
          </p>
        </Section>

        <Section id="website" title="What we look up about your website">
          <p>
            When you verify your product&apos;s domain, our server looks up the DNS record you add
            for it, and checks it again while the domain is verified.
          </p>
        </Section>

        <Section id="purposes" title="Why we use it">
          <List>
            <li>
              To provide the service: your account, profile and products, revenue verification and
              domain checks, messages, and emails about your account and what happens on it, such as
              unread messages and milestones (performance of a contract, GDPR Article 6(1)(b)).
            </li>
            <li>
              To keep the service secure and fair, for example through sign-in records, limits on
              what an account can do, and checks that stop one account from verifying two products
              (our legitimate interests, Article 6(1)(f)).
            </li>
            <li>
              To handle reports and moderate the site, including what the EU Digital Services Act
              requires (a legal obligation, Article 6(1)(c), and our legitimate interests, Article
              6(1)(f)).
            </li>
            <li>
              To understand how people find and use the service, and to improve and develop it, from
              the site statistics, how accounts found the site, how far they get and the feedback
              they send, in totals and for single accounts (our legitimate interests, Article
              6(1)(f)).
            </li>
            <li>
              To write to you about your account, your products and the service, for example to help
              you finish a listing or to ask for your view (our legitimate interests, Article
              6(1)(f)).
            </li>
          </List>
          <p>
            You can turn some emails off in your settings, and object to use based on our legitimate
            interests (see Your rights).
          </p>
        </Section>

        <Section id="statistics" title="Site statistics">
          <p>
            We keep statistics about how the site is used: the pages visited and how long they were
            visible, clicks on links to other sites, where visits came from (the linking site or app
            and campaign tags), the country and city looked up from the IP address, the
            browser&apos;s language, and the type and version of the device, browser and operating
            system. To tell visitors apart, our server combines the IP address and the
            browser&apos;s user agent with a value that changes every day, and keeps the result
            instead of the IP address. When you create an account, this is used to find where the
            visit that led to it came from, which is then kept with your account.
          </p>
          <p>
            Admins see the statistics as totals, and how a single account found the site. The
            founder of a product sees how often its page was viewed.
          </p>
          <p>
            We also use Vercel Web Analytics and Vercel Speed Insights, which record similar
            information about visits and how fast pages load.
          </p>
        </Section>

        <Section id="visibility" title="Who can see it">
          <List>
            <li>
              <strong className="font-medium text-foreground">Everyone:</strong> your profile, your
              products, and the figures you do not hide, such as verified MRR and its history, with
              the payment provider that verified them and the milestones reached. Whether a
              product&apos;s domain is verified is public too. A badge you embed on your own site
              shows the shared figures there.
            </li>
            <li>
              <strong className="font-medium text-foreground">You:</strong> your account and
              settings, the figures you keep private, your verification history and how often your
              products&apos; pages were viewed.
            </li>
            <li>
              <strong className="font-medium text-foreground">The users you write to:</strong> the
              conversations you have with them, and how far you have read them. Messages are not
              end-to-end encrypted.
            </li>
            <li>
              <strong className="font-medium text-foreground">Admins:</strong> the people the
              operator appoints to run and moderate the site. They see account details such as your
              email address, when you joined and signed in and from which country, how you found the
              site and how far you have come with the service, the latest verified MRR and revenue
              of your products, including the figures you keep private, reports, decisions,
              feedback, and messages that are reported. Alerts are also sent to the admins&apos;
              chat on Telegram: about new accounts, with the name and username, how the account was
              created and whether its email address is confirmed; about new products, with their
              name, tagline, category and founder; about reports, with who sent them, what or whom
              they are about, the reason and the explanation; and about feedback, with who sent it,
              from which page, and its text, and for a visitor whether they left an email address,
              never the address itself. So is a notice with your name and username when you write to
              the site&apos;s own account, but never the message.
            </li>
            <li>
              <strong className="font-medium text-foreground">Service providers:</strong> our
              hosting, database and email providers process data on our behalf to run the site. The
              site runs on Vercel, with its servers in Frankfurt, Germany. The database, sign-in and
              image storage run on Supabase, in its Frankfurt, Germany region. Emails are sent
              through Resend. Vercel also records the statistics described above. If you sign in
              with Google or GitHub, that service learns that you signed in here, under its own
              privacy policy. Vercel and Resend are based in the United States. When they handle
              data outside the EU or EEA, we rely on the safeguards the GDPR provides for, such as
              the EU standard contractual clauses. Telegram, which delivers the alerts to admins
              under its own terms, is based outside the EU.
            </li>
          </List>
          <p>
            When you follow a link to a product&apos;s website, that site may see that you came from
            The SaaS Harbor.
          </p>
          <p>
            We may disclose personal data when the law requires it, to protect the rights and safety
            of the site, its users or us, or to a buyer or successor if the service is sold or
            merged (a legal obligation, Article 6(1)(c), or our legitimate interests, Article
            6(1)(f)).
          </p>
        </Section>

        <Section id="cookies" title="Cookies">
          <p>
            The site uses cookies to keep you signed in and to remember whether you chose the light
            or dark theme. Short-lived cookies also carry a sign-in with Google or GitHub, or a
            connection to Gumroad, from its start to its end, and for a few minutes after you add a
            product or connect a payment provider, which product it was and how connecting went.
          </p>
        </Section>

        <Section id="retention" title="How long we keep it">
          <p>
            We keep your data while you have an account. An account whose sign-up is not finished,
            such as one whose email address is not confirmed, is deleted after about a week. When
            you delete a product or your account, the data that belongs to it is deleted, apart from
            what is needed for longer, such as reports and decisions that are still relevant, and
            copies in backups until those backups expire. The site statistics are kept apart from
            accounts for up to 25 months. Feedback from visitors without an account, with any email
            address left for a reply, is deleted after 12 months. Records of sent emails and other
            technical records are kept for a short time. Alerts sent to admins on Telegram stay in
            their chat until they are deleted there. Information that was public may already have
            been copied by others, such as search engines.
          </p>
          <p>
            We use technical and organisational measures to protect your data, such as encryption of
            provider keys and access rules in the database.
          </p>
        </Section>

        <Section id="rights" title="Your rights">
          <p>
            You can change your profile and products, choose which emails you get, and delete a
            product or your whole account yourself.
          </p>
          <p>
            Under the GDPR you also have the right to access your data, have it corrected, erased or
            moved to another service, restrict how it is used, and object to use based on our
            legitimate interests.{contact && <> To use these rights, write to {contact}.</>} You can
            also complain to a data protection authority, for example in the country where you live
            or work.
          </p>
        </Section>

        <Section id="changes" title="Changes to this policy">
          <p>
            This policy changes as the service does. The date at the top shows when it last changed.
          </p>
        </Section>
      </div>
    </Shell>
  );
}
