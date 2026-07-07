"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import API from "@/services/api";
import { HugeiconsIcon } from "@hugeicons/react";
import { BadgeCheckIcon, CircleXIcon } from "@hugeicons/core-free-icons";

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reference = searchParams.get("reference") || searchParams.get("trxref");
  const [status, setStatus] = useState(reference ? "verifying" : "failed");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!reference) return;

    API.verifyPayment(reference)
      .then((data) => {
        if (data.status === "success") {
          const ticket = data.tickets?.[0];
          const payment = data.payment;
          const event = payment?.event || {};

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
          setTimeout(() => router.push("/ticket-confirmation"), 1500);
        } else {
          setStatus("failed");
        }
      })
      .catch((err) => {
        const msg = err?.response?.data?.error || err?.message || "Unknown error";
        console.error("Verification failed:", msg, err?.response?.data);
        setErrorMsg(msg);
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
      <h2 className="text-2xl font-bold text-gray-900">Payment Failed</h2>
      <p className="text-gray-600">Your payment could not be verified. Please try again.</p>
      {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
      <button
        onClick={() => router.back()}
        className="mt-4 px-6 py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 transition-colors"
      >
        Try Again
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
