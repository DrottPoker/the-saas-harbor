import Link from "next/link";
import { Contact, LegalList, LegalSection, legalLink } from "@/components/legal";
import { Notice, PageHeader, Shell } from "@/components/shell";
import { legalDate, operator, termsUpdated } from "@/lib/legal";
import { DAILY_PRODUCT_LIMIT, PRODUCT_LIMIT } from "@/lib/moderation";
import { pageMetadata } from "@/lib/seo";

const description =
  "The rules for using The SaaS Harbor, how moderation works, and the limits of our responsibility.";

export const metadata = pageMetadata({ title: "Terms of Service", description, path: "/terms" });

export default function Terms() {
  return (
    <Shell size="narrow">
      <PageHeader title="Terms of Service" description={description} />
      <div className="grid gap-10 border-t pt-10">
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">Last updated {legalDate(termsUpdated)}.</p>
          {!operator.email && (
            <Notice>
              A contact address for questions, reports from people without an account, and appeals
              will be published here soon.
            </Notice>
          )}
        </div>

        <LegalSection id="about" title="About these terms">
          <p>
            These terms apply when you use The SaaS Harbor, which is run by {operator.name}. You
            accept them when you create an account, by ticking the box on the sign-up form, and by
            using the site. If you do not agree, do not use the site. The{" "}
            <Link className={legalLink} href="/privacy">
              privacy policy
            </Link>{" "}
            explains what we store about you and why.
          </p>
        </LegalSection>

        <LegalSection id="account" title="Your account">
          <LegalList>
            <li>
              Use your own name, or the name you are known by, and keep your email address up to
              date.
            </li>
            <li>
              Keep your password to yourself. You are responsible for everything that is done with
              your account.
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
            Your products, profile and messages stay yours, and you are solely responsible for them.
            You must have the right to publish them, including logos and photos, and they must be
            accurate and lawful. By publishing a product or a profile, you let us show it on the
            site for as long as it is published.
          </p>
          <p>
            We do not check or verify what users publish, apart from reading the revenue figures
            described below. Only list products you run or are allowed to represent. An account can
            list up to {PRODUCT_LIMIT} products and add up to {DAILY_PRODUCT_LIMIT} a day.
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
            <li>
              Copying or scraping the site&apos;s listings, profiles or figures in bulk, or
              republishing them elsewhere.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection id="revenue" title="Revenue figures">
          <p>
            Revenue figures are read from your payment provider through a read-only key you provide,
            and are calculated as described in{" "}
            <Link className={legalLink} href="/about">
              How it works
            </Link>
            . We do not change them, but we do not guarantee that they are accurate, complete or up
            to date, and we may hide figures we have reason to believe were manipulated.
          </p>
          <p>
            The figures and everything else on the site are information only. They are not
            financial, investment, legal or tax advice, and not an offer or recommendation to buy,
            sell or invest in anything. You are responsible for your own decisions and should check
            any information yourself before you rely on it.
          </p>
          <p>
            You are responsible for the keys you provide: that you are allowed to share them, and
            that they have only the read permissions described on the site. Your payment
            provider&apos;s own terms apply to your account there, and we are not responsible for
            the provider or its services.
          </p>
        </LegalSection>

        <LegalSection id="messages" title="Messages and dealings between users">
          <p>
            Messages are private between two users. You can block a user, and limits stop an account
            from sending too many messages. Do not use messages for advertising people did not ask
            for.
          </p>
          <p>
            We are not a party to anything users discuss, agree or do between themselves, such as
            partnerships, sales, investments or other deals. Any such dealings, and any dispute that
            comes from them, are solely between the users involved and at their own risk. We do not
            verify users or what they say, and we do not mediate disputes.
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
            reports. Admins may also act on problems they find without a report, and we may remove
            content or suspend accounts at our own discretion to protect the site, its users or us.
          </p>
          <p>
            If you disagree with a decision, write to <Contact /> and say why. We will look at the
            decision again and reply.
          </p>
        </LegalSection>

        <LegalSection id="changes" title="Changes and availability">
          <p>
            We may change, suspend or stop the site or any part of it at any time, with or without
            notice. We may change these terms at any time. We then update the date at the top and
            tell registered users about significant changes. By continuing to use the site after a
            change, you accept the new terms.
          </p>
        </LegalSection>

        <LegalSection id="warranties" title="No warranties">
          <p>
            The SaaS Harbor is free to use and is provided &quot;as is&quot; and &quot;as
            available&quot;, without warranties of any kind. We do not promise that the site is
            available, secure or free of errors, or that any information on it, including revenue
            figures, profiles and listings, is accurate, complete or up to date. You use the site
            and rely on its information at your own risk.
          </p>
        </LegalSection>

        <LegalSection id="liability" title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, {operator.name} and anyone working with us are
            not liable for any direct, indirect, incidental, special or consequential loss or damage
            arising from your use of the site, including:
          </p>
          <LegalList>
            <li>Lost profits, revenue, business, opportunities, goodwill or data.</li>
            <li>
              Losses from relying on information on the site, including revenue figures and what
              other users publish.
            </li>
            <li>
              Losses from the conduct of other users, including messages, misrepresentations and
              fraud, and from deals or disputes between users.
            </li>
            <li>
              Losses from errors, interruptions, lost content, or unauthorised access to the site or
              your account.
            </li>
            <li>Losses connected with your payment provider or other third-party services.</li>
          </LegalList>
          <p>
            These limits do not apply where the law does not allow them, for example for harm caused
            intentionally or by gross negligence.
          </p>
        </LegalSection>

        <LegalSection id="indemnification" title="Indemnification">
          <p>
            You agree to indemnify and hold harmless {operator.name} and anyone working with us
            against any claims, losses, damages, costs and expenses, including reasonable legal
            fees, that arise from your use of the site, what you publish or send, your breach of
            these terms or the law, or any dispute between you and another user.
          </p>
        </LegalSection>

        <LegalSection id="law" title="Governing law">
          <p>
            These terms are governed by Swedish law, and disputes are decided by the Swedish general
            courts, unless mandatory law gives you the right to go to court elsewhere.
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
