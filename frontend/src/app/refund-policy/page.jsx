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
        <p className="text-sm text-gray-400 mb-10">Last updated: October 8, 2026</p>

        <div className="prose prose-sm max-w-none text-gray-600 space-y-8">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Overview</h2>
            <p>
              This Refund Policy explains when ticket money is returned on the Byro platform. In
              short: tickets cannot be refunded on request. Money is returned when an organiser
              cancels an event.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Refunds Are Not Available On Request</h2>
            <p>
              Once you have bought a ticket, it cannot be refunded because you changed your mind,
              cannot attend, or no longer want it. Please check the date, venue and details of an
              event before you buy. If the event allows it, you can transfer your ticket to someone
              else.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. When an Organiser Cancels an Event</h2>
            <p>
              If an organiser cancels an event, every ticket for it stops being valid and everyone
              who paid is refunded. We email all ticket holders as soon as the event is cancelled,
              including the organiser&apos;s reason.
            </p>
            <p className="mt-2">
              You do not need to do anything or ask for the refund. We send it to the card or bank
              account you paid with, and we email you again when it has been sent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. What You Get Back</h2>
            <p>
              You are refunded the <strong>ticket price</strong> you paid, after any discount code.
              The following are <strong>not refunded</strong>:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Byro&apos;s service fee, where it was added to your order.</li>
              <li>The payment processing charge taken by the payment provider.</li>
            </ul>
            <p className="mt-2">
              Your confirmation and cancellation emails show the amount you will get back.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Postponed or Rescheduled Events</h2>
            <p>
              If an event is postponed or rescheduled but not cancelled, your ticket stays valid for
              the new date and no refund is due. If the organiser cancels instead, section 3 applies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Free Tickets</h2>
            <p>
              Free tickets carry no monetary value, so there is nothing to refund. If you can no
              longer attend, you can cancel your registration through the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. How Refunds Are Paid</h2>
            <p>
              Refunds go back to the payment method you used: the same card, or the bank account you
              paid from. We cannot send a refund to a different account. If your bank has not shown the
              money after the time below, or you see a problem, write to{" "}
              <a href="mailto:support@usebyro.com" className="text-blue-600 hover:underline">
                support@usebyro.com
              </a>{" "}
              with your ticket ID.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Refund Processing Time</h2>
            <p>
              Once we have sent a refund, banks usually show it within 3&ndash;10 business days,
              depending on your bank or payment provider. Byro is not responsible for delays caused
              by financial institutions.
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
