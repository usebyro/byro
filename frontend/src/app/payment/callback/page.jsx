"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import API from "@/services/api";
import { trackPurchase } from "@/lib/analytics";
import { openPaymentSupport } from "@/lib/support";
import { HugeiconsIcon } from "@hugeicons/react";
import { BadgeCheckIcon, CircleXIcon } from "@hugeicons/core-free-icons";

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reference = searchParams.get("reference") || searchParams.get("trxref");
  const [status, setStatus] = useState(reference ? "verifying" : "failed");
  const [cancelledMsg, setCancelledMsg] = useState("");

  useEffect(() => {
    if (!reference) return;

    API.verifyPayment(reference)
      .then((data) => {
        if (data.status === "event_cancelled") {
          // The organiser cancelled while this buyer was paying: no ticket, the ticket price comes back.
          setCancelledMsg(data.message || "This event was cancelled before your payment went through.");
          setStatus("cancelled");
        } else if (data.status === "success") {
          const ticket = data.tickets?.[0];
          const payment = data.payment;
          const event = payment?.event || {};

          // Count the sale now that Paystack says it was paid. Once per payment, even if the page is reloaded.
          try {
            const key = `purchase_tracked_${reference}`;
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, "1");
              trackPurchase({
                transactionId: reference,
                eventName: event?.name || ticket?.event_name || "",
                eventSlug: event?.slug || "",
                value: Number(payment?.amount) || 0,
                quantity: data.tickets?.length || 1,
                isFree: false,
              });
            }
          } catch {}

          const ticketData = {
            attendeeName: payment?.customer_name || "",
            attendeeEmail: payment?.customer_email || ticket?.current_owner_email || "",
            eventName: event?.name || ticket?.event_name || "",
            eventDate: event?.day || ticket?.event_date || "",
            timeFrom: event?.time_from || ticket?.event_time || "",
            eventLocation: event?.location || ticket?.event_location || "",
            ticketId: ticket?.ticket_id || ticket?.id,
          };

          localStorage.setItem("ticketData", JSON.stringify(ticketData));

          // Confirmation email is sent by the backend (Django verify_payment).
          // Do not send it here to avoid duplicates.

          setStatus("success");
          setTimeout(() => router.push("/order-confirmed"), 1500);
        } else {
          setStatus("failed");
        }
      })
      .catch((err) => {
        const msg = err?.response?.data?.error || err?.message || "Unknown error";
        console.error("Verification failed:", msg, err?.response?.data);
        setStatus("failed");
      });
  }, [reference, router]);

  if (status === "verifying") {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-green-500"></div>
        <p className="text-gray-600 text-lg">Verifying your payment...</p>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900">This event was cancelled</h2>
        <p className="text-gray-600 max-w-md">{cancelledMsg}</p>
        <p className="text-sm text-gray-500 max-w-md">
          Byro&apos;s service fee and the payment processing charge cannot be refunded. You will get an email when your refund is sent.
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-2 px-6 py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 transition-colors"
        >
          Back to Byro
        </button>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
          <HugeiconsIcon icon={BadgeCheckIcon} size={40} color="#22c55e" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Payment Successful!</h2>
        <p className="text-gray-600">Redirecting to your ticket...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
        <HugeiconsIcon icon={CircleXIcon} size={40} color="#ef4444" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900">We couldn&apos;t confirm your payment</h2>
      <p className="text-gray-600 max-w-md text-center px-6">
        If you were debited, don&apos;t pay again. Contact support and we&apos;ll sort it out.
      </p>
      {reference && <p className="text-sm text-gray-500">Reference: {reference}</p>}
      <button
        onClick={() => openPaymentSupport({ reference })}
        className="mt-2 px-6 py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 transition-colors"
      >
        Contact support
      </button>
      <button
        onClick={() => router.back()}
        className="px-6 py-3 border border-gray-300 text-gray-900 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-green-500"></div>
        </div>
      }
    >
      <PaymentCallbackContent />
    </Suspense>
  );
}
