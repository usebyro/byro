import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Refund Policy | Byro",
  description: "Read Byro's Refund Policy for ticket purchases.",
};

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-14">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Refund Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: July 3, 2026</p>

        <div className="prose prose-sm max-w-none text-gray-600 space-y-8">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Overview</h2>
            <p>
              This Refund Policy explains how ticket refunds are handled on the Byro platform.
              Refund eligibility depends on the event organizer's refund settings and the
              circumstances of the request.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Organizer-Controlled Refunds</h2>
            <p>
              Each event on Byro is independently managed by its organizer. Refund availability,
              deadlines, and conditions are set by the organizer at the time of event creation.
              Before purchasing a ticket, we encourage you to review the event's refund terms.
            </p>
            <p className="mt-2">
              If an organizer offers refunds, you may request one through the Platform up until
              the organizer's stated deadline. After this deadline, refunds may no longer be available.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Event Cancellation by Organizer</h2>
            <p>
              If an event is cancelled by the organizer, all attendees are entitled to a full refund
              of the ticket price paid. Service fees may be non-refundable depending on the payment
              provider's policy. Byro will notify attendees of cancellations via email.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Event Postponement or Rescheduling</h2>
            <p>
              If an event is postponed or rescheduled, the organizer will communicate the new date
              to attendees. If you cannot attend the rescheduled event, please contact the organizer
              directly. Refunds for rescheduled events are at the organizer's discretion.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Free Tickets</h2>
            <p>
              Free tickets carry no monetary value. There is nothing to refund for free ticket
              registrations. You may cancel your registration through the Platform if you can no
              longer attend.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Non-Refundable Circumstances</h2>
            <p>Refunds will not be issued in the following situations:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>You were unable to attend an event that was not cancelled.</li>
              <li>The refund request is made after the organizer's stated deadline.</li>
              <li>The ticket was purchased using a promotional code or discount that explicitly excluded refunds.</li>
              <li>The event occurred and you were denied entry due to a violation of the organizer's rules.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. How to Request a Refund</h2>
            <p>
              To request a refund, contact the event organizer directly or reach out to Byro support
              at{" "}
              <a href="mailto:support@usebyro.com" className="text-blue-600 hover:underline">
                support@usebyro.com
              </a>{" "}
              with your ticket ID and reason for the refund. We will work with the organizer to
              resolve your request as quickly as possible.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Refund Processing Time</h2>
            <p>
              Approved refunds are processed within 5–10 business days, depending on your bank or
              payment provider. Byro is not responsible for delays caused by financial institutions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Contact Us</h2>
            <p>
              If you have any questions about this Refund Policy, please contact us at{" "}
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
