import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Terms of Service | Byro",
  description: "Read Byro's Terms of Service.",
};

const H2 = "text-lg font-semibold text-gray-900 mb-2";
const MAIL = "text-blue-600 hover:underline";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-14">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: October 10, 2026</p>

        <div className="prose prose-sm max-w-none text-gray-600 space-y-8">
          <section>
            <h2 className={H2}>1. Introduction</h2>
            <p>
              Please read these Terms of Service (&quot;Terms&quot;) before you use Byro. They explain the rules for using our website, apps and services (together, the &quot;Platform&quot;). If you do not agree with them, do not use the Platform.
            </p>
            <p className="mt-2">
              These Terms are an agreement between you and <strong>Byro Ticketing Solutions</strong> (&quot;Byro&quot;, &quot;we&quot;, &quot;us&quot;), the operator of the Platform at <a href="https://usebyro.com" className={MAIL}>usebyro.com</a>. &quot;You&quot; means anyone who visits or uses the Platform. They should be read together with our <Link href="/privacy" className={MAIL}>Privacy Policy</Link>, <Link href="/cookies" className={MAIL}>Cookie Policy</Link> and <Link href="/refund-policy" className={MAIL}>Refund Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className={H2}>2. Who we are and key terms</h2>
            <p>
              Byro Ticketing Solutions is based in Nigeria. You can reach us by email at <a href="mailto:support@usebyro.com" className={MAIL}>support@usebyro.com</a> or by phone on +234 810 505 8491.
            </p>
            <p className="mt-2">
              In these Terms:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong>Organiser</strong> means anyone who creates and runs an event on Byro, including a venue, promoter, community or co-host;</li>
              <li><strong>Attendee</strong> means anyone who registers for an event or buys a ticket;</li>
              <li><strong>User</strong> means any Organiser or Attendee;</li>
              <li><strong>Account</strong> means the profile you create on the Platform;</li>
              <li><strong>Content</strong> means anything you upload or publish, such as event details, images, descriptions and profile information.</li>
            </ul>
          </section>

          <section>
            <h2 className={H2}>3. Who can use Byro</h2>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>You must be at least 18 years old to use the Platform. By using it, you confirm that you are.</li>
              <li>If you use Byro for a company or organisation, you confirm you have authority to bind it to these Terms.</li>
              <li>You must comply with all laws that apply to your use of the Platform.</li>
            </ul>
            <p className="mt-2">
              By creating an account, signing in or otherwise using the Platform, you confirm that you have read and agree to these Terms and our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className={H2}>4. Your account</h2>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>You can sign in with your email address and a one-time code, or with Google. We do not use passwords.</li>
              <li>Give us accurate, current information and keep it up to date. We may check it with independent sources.</li>
              <li>You are responsible for everything that happens under your account and for keeping access to your email and Google account secure. Tell us at once if you think someone else has accessed it.</li>
              <li>We may ask for more information about you or how you use Byro. If you do not provide it in time, we may limit or close your account.</li>
              <li>We may decline or end an account at any time where the law allows, including where we suspect misuse.</li>
            </ul>
          </section>

          <section>
            <h2 className={H2}>5. How Byro works</h2>
            <p>
              Byro is a platform that connects Organisers with Attendees. Organisers create events, set ticket types and prices, and sell tickets through Byro. Attendees find events and register or buy tickets.
            </p>
            <p className="mt-2">
              When an Attendee buys a ticket, the contract for the event is between the Attendee and the Organiser. Byro is not the organiser or seller of the event, and does not control, endorse or guarantee any event, venue or Organiser.
            </p>
          </section>

          <section>
            <h2 className={H2}>6. Organiser responsibilities</h2>
            <p>
              If you create events, you agree to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>give accurate and complete event details, including date, time, location, ticket types, prices and what is included;</li>
              <li>tell Attendees promptly, and update your Byro event page, if an event is cancelled, postponed, moved or materially changed;</li>
              <li>handle questions and complaints from your Attendees yourself and reply within a reasonable time (we aim for three days);</li>
              <li>set and honour your own refund terms, in line with the law and our Refund Policy;</li>
              <li>hold all licences, permits, rights and insurance needed to run your event and sell tickets;</li>
              <li>use Attendee personal data only to run your event, and protect it as data protection law requires;</li>
              <li>accept responsibility for your dealings with Attendees, and for the safety and conduct of your event.</li>
            </ul>
            <p className="mt-2">
              We may suspend or remove events or accounts that break these Terms or put Attendees at risk.
            </p>
          </section>

          <section>
            <h2 className={H2}>7. Tickets, fees and payments</h2>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Ticket sales are subject to availability. The price shown at checkout is the price you pay, including any service fee.</li>
              <li>A service fee may apply to paid tickets. Fees are shown before you pay, and the Pricing page lists current rates.</li>
              <li>Payments are processed by Paystack or other third-party payment providers. We do not store your full card details, and the provider&apos;s own terms apply to the payment.</li>
              <li>Ticket payments are collected through Byro&apos;s Paystack account, not directly by the Organiser. Organiser earnings are paid out to the bank account the Organiser provides, after fees.</li>
              <li>We may hold, delay or withhold a payout while we verify the Organiser and the event, check that the event is genuine, investigate suspected fraud, chargebacks or disputes, deal with a cancelled or changed event, or meet legal and Paystack compliance requirements. We may ask for identity, business or event documents, and a payout may stay on hold until we receive them.</li>
              <li>Refunds are handled under our Refund Policy and the Organiser&apos;s terms.</li>
              <li>Tickets are for the named event only. You may not resell a ticket for more than its face value or in breach of the Organiser&apos;s rules, and we may cancel tickets we believe were obtained or sold unfairly.</li>
            </ul>
          </section>

          <section>
            <h2 className={H2}>8. Your content</h2>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>You keep ownership of the Content you post.</li>
              <li>You give Byro a non-exclusive, worldwide, royalty-free licence to host, display, copy and promote your Content as needed to run and market the Platform and your events.</li>
              <li>You confirm that you have the rights to post your Content, and that it does not infringe anyone else&apos;s rights or break the law.</li>
              <li>We may remove Content that breaks these Terms or that we reasonably consider harmful.</li>
            </ul>
          </section>

          <section>
            <h2 className={H2}>9. Prohibited uses</h2>
            <p>
              You agree not to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>use Byro for anything unlawful, fraudulent or harmful, including fraud, money laundering or financing of terrorism;</li>
              <li>post false, misleading or fake events, or sell tickets you do not have the right to sell;</li>
              <li>impersonate anyone, or give false information about who you are or who you represent;</li>
              <li>post content that is hateful, threatening, sexually exploitative or that harms children;</li>
              <li>access another person&apos;s account, or ask for their sign-in details;</li>
              <li>overload, disrupt, scrape, probe or try to break into the Platform or its security, or bypass bot protection;</li>
              <li>use bots or automated tools to buy tickets or create accounts without our permission;</li>
              <li>reverse engineer or copy any part of the Platform, except as the law allows.</li>
            </ul>
            <p className="mt-2">
              If we suspect a breach, we may suspend or close your account, cancel tickets or events, and report the matter to the authorities. We are not liable for loss that results from your misuse of the Platform.
            </p>
          </section>

          <section>
            <h2 className={H2}>10. Communications</h2>
            <p>
              You agree that we may contact you electronically, including by email and notifications on the Platform, about your account, tickets, events and these Terms. Marketing emails are sent only if you opt in, and you can unsubscribe at any time. You are responsible for any charges your internet or phone provider makes for receiving our messages.
            </p>
          </section>

          <section>
            <h2 className={H2}>11. Privacy and monitoring</h2>
            <p>
              We handle personal data as described in our Privacy Policy and in line with the Nigeria Data Protection Act 2023. To keep the Platform safe and working, we may monitor, log and review how it is used, as the law allows. This does not give you any claim against us for how we do so.
            </p>
          </section>

          <section>
            <h2 className={H2}>12. Intellectual property</h2>
            <p>
              The Platform, including the Byro name, logo, design, software and our own content, belongs to us or our licensors and is protected by intellectual property laws. You may not copy, distribute, modify or use it commercially without our written permission. Where we give permission, you must credit us as the source.
            </p>
          </section>

          <section>
            <h2 className={H2}>13. Availability and changes to the service</h2>
            <p>
              We work to keep Byro running, but we cannot promise it will always be available, uninterrupted or error-free. We may need to pause parts of it for maintenance, and outages can happen. We may change, add or remove features at any time, with or without notice. You are responsible for your own device, software and internet connection, and we are not liable for viruses or harmful material that reach your device through your use of the Platform.
            </p>
          </section>

          <section>
            <h2 className={H2}>14. Third-party services</h2>
            <p>
              Byro works with third parties such as payment, sign-in and email providers, and may link to other sites. We do not control them, do not endorse them and are not responsible for their services, content or privacy practices. Their own terms apply when you use them, and you use them at your own risk. Any dispute with a third-party provider is governed by that provider&apos;s terms.
            </p>
          </section>

          <section>
            <h2 className={H2}>15. Suspension, termination and withdrawal</h2>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>You can stop using Byro and close your account at any time by emailing us. Closing your account does not cancel tickets you have bought or events you have sold.</li>
              <li>We may suspend or end your access at any time, with or without notice, including if you break these Terms or we are required to by law.</li>
              <li>We will cooperate with law enforcement and court orders, including by sharing information about users where legally required.</li>
              <li>Terms that by their nature should continue after your access ends, such as those on intellectual property, liability and disputes, will continue.</li>
            </ul>
          </section>

          <section>
            <h2 className={H2}>16. Your promises to us</h2>
            <p>
              By using the Platform you confirm that:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>you have read and understood these Terms and are at least 18;</li>
              <li>the information you give us is true, accurate and complete;</li>
              <li>your use of Byro does not break any law or any contract you are bound by;</li>
              <li>you will not transfer your rights under these Terms to anyone else without our written agreement.</li>
            </ul>
          </section>

          <section>
            <h2 className={H2}>17. Limitation of liability</h2>
            <p>
              Byro is not a party to the agreement between an Organiser and an Attendee, and we are not responsible for how an event is run, whether it goes ahead, or for any dispute between Users. We do not screen Users and are not responsible for fraud or misconduct by them.
            </p>
            <p className="mt-2">
              To the fullest extent the law allows, Byro Ticketing Solutions is not liable for any indirect, incidental, special, consequential, punitive or exemplary loss, or for loss of profit, revenue, business, goodwill or data, arising from your use of or inability to use the Platform. This includes loss caused by outages, errors or delays, equipment or network failure, events outside our control (such as severe weather, fire, strikes, war or government action), and theft of or unauthorised access to your information. Nothing in these Terms limits liability that cannot lawfully be limited.
            </p>
          </section>

          <section>
            <h2 className={H2}>18. Disclaimer of warranties</h2>
            <p>
              The Platform is provided &quot;as is&quot; and &quot;as available&quot;. We do not guarantee that it will meet your needs, or that the information on it, including event listings supplied by Organisers, is accurate, complete or reliable.
            </p>
          </section>

          <section>
            <h2 className={H2}>19. Indemnity</h2>
            <p>
              You agree to cover Byro Ticketing Solutions and its directors, officers, employees and partners against claims, losses, costs and expenses (including reasonable legal fees) that arise from your use of the Platform, your Content, your events, or your breach of these Terms or the law.
            </p>
          </section>

          <section>
            <h2 className={H2}>20. Changes to these Terms</h2>
            <p>
              We may update these Terms from time to time. We will change the date at the top and, for material changes, tell you by email or on the Platform. The version in force when you use Byro applies to that use, and continuing to use the Platform after a change means you accept it.
            </p>
          </section>

          <section>
            <h2 className={H2}>21. Governing law and disputes</h2>
            <p>
              These Terms are governed by the laws of the Federal Republic of Nigeria. If a dispute arises, please contact us first so we can try to resolve it informally. If it is not resolved within 30 days, either of us may take it to the courts of Lagos, Nigeria, which have exclusive jurisdiction.
            </p>
          </section>

          <section>
            <h2 className={H2}>22. General</h2>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>If any part of these Terms is found to be unlawful or unenforceable, the rest stays in force.</li>
              <li>If we do not enforce a right straight away, we have not given it up.</li>
              <li>We may transfer our rights and duties under these Terms, for example in a merger or sale. You may not transfer yours without our written consent.</li>
              <li>We and you are independent parties. Nothing here makes either of us the agent, employee or partner of the other.</li>
              <li>These Terms, with the policies linked above, are the whole agreement between you and us about the Platform.</li>
            </ul>
          </section>

          <section>
            <h2 className={H2}>23. Contact</h2>
            <p>
              Questions about these Terms? Email <a href="mailto:support@usebyro.com" className={MAIL}>support@usebyro.com</a> or call +234 810 505 8491.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
