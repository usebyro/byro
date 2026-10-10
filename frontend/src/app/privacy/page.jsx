import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Privacy Policy | Byro",
  description:
    "How Byro collects, uses, shares and protects your personal data, including data received from Google sign-in.",
};

const H2 = "text-lg font-semibold text-gray-900 mb-2";
const MAIL = "text-blue-600 hover:underline";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-14">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: October 10, 2026</p>

        <div className="prose prose-sm max-w-none text-gray-600 space-y-8">
          <section>
            <h2 className={H2}>1. Who we are</h2>
            <p>
              Byro (&quot;Byro&quot;, &quot;we&quot;, &quot;us&quot;), operated by Byro Ticketing Solutions, is a community events platform at <a href="https://usebyro.com" className={MAIL}>usebyro.com</a>, including our related websites and apps (the &quot;Site&quot;). Attendees use Byro to discover events, buy tickets and collect stamps. Organisers use Byro to create events, sell tickets and check guests in. This policy explains what personal data we collect, why we use it, who we share it with, and the choices you have. Please read it carefully.
            </p>
          </section>

          <section>
            <h2 className={H2}>2. Information we collect</h2>
            <p>
              We collect information when you fill in forms, sign in, buy tickets, email us, or use the Site. This includes:
            </p>            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong>Personal data.</strong> Your name, email address and profile photo, plus details you choose to add such as your username, phone number, location or interests. You do not have to give us any of this, but without it some features, such as buying a ticket, will not work.</li>
              <li><strong>Google sign-in data.</strong> If you choose Continue with Google, we receive your Google account email address, name and profile picture. We never receive your Google password.</li>
              <li><strong>Ticket and order data.</strong> Events you register for or buy tickets to, ticket details, attendee names and emails, order history and check-in records.</li>
              <li><strong>Organiser data.</strong> Event details and images, communities you run, attendee lists, and payout details such as the bank account you give us to receive earnings.</li>
              <li><strong>Financial data.</strong> Card and bank payments are handled by Paystack on its own pages. We receive confirmation of payment, the amount and a transaction reference. We do not see or store your full card details.</li>
              <li><strong>Derivative data.</strong> Information our servers collect automatically, such as your IP address, browser type, operating system, access times and the pages you view.</li>
              <li><strong>Device data.</strong> Device model, operating system and approximate location if you use Byro from a mobile device.</li>
              <li><strong>Communications.</strong> Emails you send us, and your newsletter subscription if you sign up.</li>
              <li><strong>Surveys and promotions.</strong> Information you give if you enter a giveaway or answer a survey.</li>
            </ul>
          </section>

          <section>
            <h2 className={H2}>3. How we use your information</h2>
            <p>
              Accurate information lets us give you a smooth, personalised experience. We use it to:
            </p>            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>create your account, sign you in and keep it secure;</li>
              <li>process orders, issue and email tickets, and let organisers check you in;</li>
              <li>process payments and refunds, and pay organisers;</li>
              <li>prevent fraud, abuse, theft and bots, and resolve disputes;</li>
              <li>send service messages such as sign-in codes, receipts, tickets, event updates and support replies;</li>
              <li>send our newsletter or event recommendations, only if you subscribed or agreed;</li>
              <li>show your name and profile to other users and organisers as part of using Byro;</li>
              <li>monitor and analyse usage and trends, fix errors and improve the Site;</li>
              <li>request feedback and respond to support requests;</li>
              <li>meet legal, tax and accounting obligations.</li>
            </ul>
          </section>

          <section>
            <h2 className={H2}>4. Google user data</h2>
            <p>
              When you sign in with Google, Byro requests only the basic profile information: your email address, name and profile picture. We use it solely to create your Byro account, sign you in, and show your name and photo on your profile.
            </p>            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>We do not access your Gmail, Google Drive, Calendar, contacts or any other Google service data.</li>
              <li>We do not sell Google user data or use it for advertising.</li>
              <li>We do not transfer it to others except to provide the sign-in service (see section 8), to follow the law, or with your consent.</li>
              <li>No person reads your Google data unless you ask us to for support, it is needed for security, or the law requires it.</li>
            </ul>
            <p className="mt-2">
              Byro&apos;s use and transfer of information received from Google APIs adheres to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                className={MAIL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 className={H2}>5. Legal bases for processing</h2>
            <p>
              We process your personal data on one or more of these lawful grounds, depending on the purpose:
            </p>            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong>Consent.</strong> For example, newsletters and optional analytics cookies. You can withdraw consent at any time and we will stop that processing. We will ask again before using your data for a new, different purpose.</li>
              <li><strong>Contract.</strong> To provide the services you ask for, such as issuing a ticket you bought or paying an organiser.</li>
              <li><strong>Legitimate interests.</strong> To keep Byro secure, prevent fraud and improve our services, where this does not override your rights.</li>
              <li><strong>Legal obligation.</strong> Where the law requires us to process or keep data.</li>
              <li><strong>Vital interests or public interest.</strong> Where needed to protect someone&apos;s life or perform a task carried out in the public interest.</li>
            </ul>            <p className="mt-2">
              To ask which basis applies to a particular use, email <a href="mailto:support@usebyro.com" className={MAIL}>support@usebyro.com</a>. We may ask you to confirm your identity before we act on a request about your data.
            </p>
          </section>

          <section>
            <h2 className={H2}>6. Your rights</h2>
            <p>
              Under the Nigeria Data Protection Act 2023 and similar laws, you have the right to:
            </p>            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>withdraw your consent at any time;</li>
              <li>ask for a copy of the personal data we hold about you;</li>
              <li>correct inaccurate data or complete incomplete data;</li>
              <li>ask us to erase your data, for example when it is no longer needed, you withdraw consent, you object successfully, or the processing is unlawful;</li>
              <li>object to, or ask us to restrict, some processing, including direct marketing;</li>
              <li>data portability: receive your data in a common, machine-readable format or have it sent to another provider;</li>
              <li>not be subject to decisions made solely by automated processing that significantly affect you;</li>
              <li>be told about a data breach likely to put your rights and freedoms at high risk;</li>
              <li>complain to the Nigeria Data Protection Commission or another regulator.</li>
            </ul>
            <p className="mt-2">
              You can edit most details in your profile settings. For anything else, email{" "}
              <a href="mailto:support@usebyro.com" className={MAIL}>support@usebyro.com</a>. To stop Byro accessing
              your Google data, remove Byro from your{" "}
              <a
                href="https://myaccount.google.com/permissions"
                className={MAIL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google account permissions
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className={H2}>7. Cookies and tracking technologies</h2>
            <p>
              We use essential cookies to keep you signed in and secure. Optional analytics cookies, such as Google Analytics, and marketing pixels, such as the Meta Pixel, are switched on only if you accept them in our cookie banner, and you can change your choice at any time. Marketing pixels let us measure our ads and show Byro to people who may be interested. You can also block or delete cookies in your browser settings, though parts of the Site may then stop working. Full details are in our <Link href="/cookies" className={MAIL}>Cookie Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className={H2}>8. Who we share information with</h2>
            <p>
              We do not sell your personal data. We share it only in these situations:
            </p>            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong>Event organisers.</strong> When you register for or buy a ticket, the organiser receives your name, email and ticket details so they can run their event. Organisers must not use attendee data for anything other than managing their event.</li>
              <li><strong>Other users.</strong> Your name, profile photo and activity you choose to make public, such as attending an event, may be visible to other users.</li>
              <li><strong>Service providers.</strong> Companies that work for us: WorkOS (sign-in and Google authentication), Paystack (payments), Resend (email delivery), Cloudflare (bot protection), Sentry (error monitoring), Google Analytics (usage analytics, with your consent), advertising platforms such as Meta (marketing pixel, with your consent), and our hosting and database providers. They may only use the data to provide their service to us, under our instructions.</li>
              <li><strong>Law and safety.</strong> Authorities or advisers where we believe in good faith that disclosure is needed to follow the law or legal process, enforce our terms, detect or prevent fraud and security problems, or protect the rights, property or safety of Byro, our users or the public.</li>
              <li><strong>Business changes.</strong> A successor, if Byro is merged, acquired or sold. We will notify you if your data is to be transferred, and the new owner must honour this policy.</li>
              <li><strong>With your consent.</strong></li>
            </ul>
          </section>

          <section>
            <h2 className={H2}>9. Third-party websites</h2>
            <p>
              Byro may link to websites and services we do not control. This policy does not cover them, and we are not responsible for their content or privacy practices. Please read their policies before giving them your information.
            </p>
          </section>

          <section>
            <h2 className={H2}>10. Security</h2>
            <p>
              We use administrative, technical and physical safeguards to protect your personal data, including encryption in transit, access controls and passwordless sign-in. No system is perfectly secure, so please keep your email account safe and tell us straight away if you suspect misuse.
            </p>
          </section>

          <section>
            <h2 className={H2}>11. How we handle personal data</h2>
            <p>
              We follow these principles. Personal data must be:
            </p>            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>processed lawfully, fairly and transparently;</li>
              <li>collected for specified, legitimate purposes and not used in ways that are incompatible with them;</li>
              <li>adequate, relevant and limited to what is necessary;</li>
              <li>accurate and kept up to date where necessary;</li>
              <li>kept in an identifiable form no longer than necessary;</li>
              <li>protected against unauthorised or unlawful processing and against accidental loss or damage.</li>
            </ul>
          </section>

          <section>
            <h2 className={H2}>12. Children</h2>
            <p>
              Byro is not for children under 18 and we do not knowingly collect their data. If you believe a child has given us personal data, email <a href="mailto:support@usebyro.com" className={MAIL}>support@usebyro.com</a> and we will delete it.
            </p>
          </section>

          <section>
            <h2 className={H2}>13. International transfers</h2>
            <p>
              Some of our providers process data outside Nigeria. Where we transfer data to a country without adequate data protection law, we use the safeguards the law provides, such as standard contractual clauses. Contact us for details of the mechanism used.
            </p>
          </section>

          <section>
            <h2 className={H2}>14. Account, communications and retention</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Your account.</strong> You can review or change your account information in your settings. To close your account and have your data deleted, email <a href="mailto:support@usebyro.com" className={MAIL}>support@usebyro.com</a> from your account email. We will delete or anonymise your data, except records we must keep to prevent fraud, investigate problems, enforce our Terms of Service and meet legal requirements (such as order and payout records).</li>
              <li><strong>Emails.</strong> You can opt out of marketing emails using the unsubscribe link, in your account settings, or by emailing us. We will still send service messages about your account and tickets.</li>
              <li><strong>Retention.</strong> We keep your data only as long as needed to provide Byro and meet our legal, tax and accounting duties. Order, ticket and payout records are kept for as long as those rules require.</li>
            </ul>
          </section>

          <section>
            <h2 className={H2}>15. Changes to this policy</h2>
            <p>
              We may update this policy at any time. We will change the date at the top and, for material changes, notify you by email or on the Site. The updated policy applies as soon as it is posted.
            </p>
          </section>

          <section>
            <h2 className={H2}>16. Contact</h2>
            <p>
              Questions or requests about privacy? Email <a href="mailto:support@usebyro.com" className={MAIL}>support@usebyro.com</a>.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
