const SUPPORT_EMAIL = "support@usebyro.com";

// Opens the chat with the payment attached so support can find it. Falls back to email if chat hasn't loaded.
export function openPaymentSupport({ reference, name, email } = {}) {
  const tawk = typeof window !== "undefined" ? window.Tawk_API : null;
  if (!tawk?.maximize) {
    const subject = encodeURIComponent(`Payment issue${reference ? ` ${reference}` : ""}`);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}`;
    return;
  }
  try {
    if (name || email) tawk.setAttributes?.({ name, email }, () => {});
    tawk.addTags?.(["payment-issue"], () => {});
    tawk.addEvent?.("payment-issue", { reference: reference || "unknown", page: window.location.pathname }, () => {});
  } catch {}
  tawk.maximize();
}
