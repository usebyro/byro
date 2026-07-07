import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Terms of Service | Byro",
  description: "Read Byro's Terms of Service.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-14">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: July 3, 2026</p>

        <div className="prose prose-sm max-w-none text-gray-600 space-y-8">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Byro (&quot;the Platform&quot;), you agree to be bound by these Terms of Service.
              If you do not agree, please do not use the Platform. Byro reserves the right to update these
              terms at any time. Continued use of the Platform after changes constitutes your acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Use of the Platform</h2>
            <p>
              Byro is a platform that enables event organizers to create and manage events, and allows
              attendees to discover and register for events. You agree to use the Platform only for lawful
              purposes and in accordance with these Terms.
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>You must be at least 18 years old to create an organizer account.</li>
              <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
              <li>You must not use the Platform to post false, misleading, or fraudulent event information.</li>
              <li>You must not attempt to disrupt or interfere with the Platform&apos;s security or functionality.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Organizer Responsibilities</h2>
            <p>
              Event organizers are solely responsible for the accuracy of event details, including date,
              time, location, ticket pricing, and event description. Byro acts as a platform and is not
              responsible for the conduct of organizers or attendees at events.
            </p>
            <p className="mt-2">
              Organizers agree not to misuse attendee personal data collected through the Platform for
              any purpose other than event management.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Ticket Purchases</h2>
            <p>
              All ticket purchases are subject to availability. Prices displayed are final at the time
              of purchase. A service fee may be applied to paid tickets. Byro processes payments through
              third-party payment providers and does not store card details.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Intellectual Property</h2>
            <p>
              All content, branding, and technology on the Byro Platform are the property of Byro and
              are protected by applicable intellectual property laws. You may not reproduce, distribute,
              or create derivative works without prior written permission.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, Byro shall not be liable for any indirect,
              incidental, special, or consequential damages arising from your use of the Platform,
              including but not limited to event cancellations, data loss, or payment issues caused
              by third-party providers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Termination</h2>
            <p>
              Byro reserves the right to suspend or terminate your account at any time if you violate
              these Terms or engage in conduct that is harmful to other users, organizers, or the
              Platform itself.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Governing Law</h2>
            <p>
              These Terms are governed by and construed in accordance with the laws of the Federal
              Republic of Nigeria. Any disputes shall be subject to the exclusive jurisdiction of
              courts in Lagos, Nigeria.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Contact</h2>
            <p>
              For questions about these Terms, contact us at{" "}
              <a href="mailto:support@usebyro.com" className="text-blue-600 hover:underline">
                support@usebyro.com
              </a>.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
