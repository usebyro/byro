// Shared wording and formatting for merch orders, so the list, the sheet and the buyer's page agree.

export const naira = (n) => `₦${Math.round(Number(n || 0)).toLocaleString("en-NG")}`;

const DAY_MONTH = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit" });

export function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return DAY_MONTH.format(d);
}

export function dayMonth(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DAY_MONTH.format(d);
}

export function dateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${shortDate(iso)}, ${TIME.format(d)}`;
}

// status -> [text, ink class, dot class]. Pickup orders that are only paid say what comes next for pickup.
const STATUS = {
  paid: ["To pack", "text-[#8A5A00]", "bg-[#E0A100]"],
  paid_pickup: ["To get ready", "text-[#8A5A00]", "bg-[#E0A100]"],
  packed: ["To ship", "text-[#2451D6]", "bg-[#3669F6]"],
  shipped: ["Shipped", "text-[#3B4252]", "bg-[#8A91A0]"],
  ready: ["Ready for pickup", "text-[#3B4252]", "bg-[#8A91A0]"],
  picked_up: ["Picked up", "text-[#1F7A52]", "bg-[#2F9E6E]"],
  delivered: ["Delivered", "text-[#1F7A52]", "bg-[#2F9E6E]"],
  cancelled: ["Cancelled", "text-[#5B6272]", "bg-[#C9D0DC]"],
  refunded: ["Refunded", "text-[#5B6272]", "bg-[#C9D0DC]"],
  refund_processing: ["Refund on its way", "text-[#5B6272]", "bg-[#C9D0DC]"],
};
const HOLD = ["On hold", "text-[#B42318]", "bg-[#D92D20]"];

export function statusOf(order) {
  if (order.on_hold) return HOLD;
  return STATUS[order.status === "paid" && order.fulfilment === "pickup" ? "paid_pickup" : order.status] || [order.status, "text-muted", "bg-[#C9D0DC]"];
}

// What bulk can do with an order, and the label for that step. Orders only group with others at the same step.
export function bulkKey(order) {
  if (order.fulfilment === "delivery" && order.status === "paid") return "pack";
  if (order.fulfilment === "delivery" && order.status === "packed") return "ship";
  if (order.fulfilment === "pickup" && order.status === "paid") return "ready";
  return "";
}

export const BULK_LABEL = {
  pack: (n) => `Mark ${n} as packed`,
  ship: (n) => `Mark ${n} as shipped`,
  ready: (n) => `Mark ${n} ready for pickup`,
};

export const BULK_HINT = {
  pack: "Nobody is emailed when an order is packed.",
  ship: "Add tracking numbers later in each order if you have them. Each buyer gets an email that their order is on the way.",
  ready: "Each buyer gets an email with the pickup address and instructions.",
};

// The one thing to do next for an order, as [title, hint, button label, action].
export function nextStep(order) {
  const pickup = order.fulfilment === "pickup";
  const steps = pickup
    ? {
        paid: ["Next: get it ready", "Put the items aside with the order number on them.", "Mark ready for pickup", "ready"],
        ready: ["Next: hand it over", "When they come, check their pickup code, then hand over the items.", "Mark as picked up", "picked_up"],
      }
    : {
        paid: ["Next: pack the order", "Put the items together. Copy or print the packing slip below if it helps.", "Mark as packed", "pack"],
        packed: ["Next: send it", "Hand it to a courier or a rider, or deliver it yourself.", "Mark as shipped", "ship"],
        shipped: ["On the way", "Mark it delivered once it reaches them.", "Mark as delivered", "delivered"],
      };
  return steps[order.status] || null;
}

// Where this order's earnings are, in a sentence the organiser can act on.
export function releaseLine(order) {
  const first = order.buyer?.first || "the buyer";
  switch (order.release_state) {
    case "available":
      return "You can withdraw this now.";
    case "releasing":
      return `Available on ${dayMonth(order.release_at)}, unless ${first} reports a problem.`;
    case "on_hold":
      return `On hold while Byro reviews a problem ${first} reported.`;
    case "not_released":
      return "Joins your balance once the order is complete.";
    default:
      return "";
  }
}

export const REPORT_REASON = { not_received: "Not received", wrong_item: "Wrong item", damaged: "Damaged", other: "Other" };

export function itemsText(order) {
  return (order.items || [])
    .map((i) => `${i.name}${i.option ? ` (${i.option})` : ""}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`)
    .join(", ");
}

export function packingSlip(order) {
  const pickup = order.fulfilment === "pickup";
  const lines = [
    `Order ${order.ref}`,
    `For ${order.buyer?.name || ""}${order.buyer?.phone ? `, ${order.buyer.phone}` : ""}`,
    pickup ? "Pickup" : `Deliver to: ${order.delivery_address || ""}`,
    ...(order.buyer?.note ? [`Note: ${order.buyer.note}`] : []),
    "",
    ...(order.items || []).map((i) => `${i.quantity} × ${i.name}${i.option ? ` (${i.option})` : ""}`),
  ];
  return lines.join("\n");
}

// ---- the organiser's balance -------------------------------------------------------------------

// Why Withdraw is off, in one line, or "" when it isn't (or when there is nothing to explain).
export function withdrawBlockedLine(balance) {
  if (!balance) return "";
  const shortfall = Number(balance.shortfall || 0);
  const merch = balance.merch || {};
  const releasing = Number(merch.releasing || 0);
  const onHold = Number(merch.on_hold || 0);
  if (shortfall > 0) {
    return releasing > 0
      ? `Withdraw is off until your balance is above ₦0. ${naira(releasing)} is releasing soon${merch.next_release_at ? `, the next on ${dayMonth(merch.next_release_at)}` : ""}.`
      : "Withdraw is off until your balance is above ₦0.";
  }
  if (Number(balance.available) > 0) return "";
  if (releasing > 0) return `Nothing to withdraw yet. Your next merch money arrives${merch.next_release_at ? ` on ${dayMonth(merch.next_release_at)}` : " soon"}.`;
  if (onHold > 0) return "Nothing to withdraw yet. Byro is reviewing a merch order.";
  return "";
}

// The merch money that isn't withdrawable yet, as the figures the balance shows. Zero ones are left out.
export function merchFigures(merch = {}) {
  const list = [
    ["releasing", "Releasing soon", merch.next_release_at ? `Next release ${dayMonth(merch.next_release_at)}` : "After each order's safety window"],
    ["on_hold", "On hold", "Byro is reviewing these orders"],
    ["not_released", "Not yet released", "Orders still to fulfil"],
  ];
  return list.filter(([key]) => Number(merch[key] || 0) > 0).map(([key, label, note]) => ({ key, label, note, value: merch[key] }));
}

// One line about where a held-back merch order's money is, for the "what's in your balance" panel.
export function heldOrderLine(order) {
  if (order.on_hold) return "On hold while Byro reviews a problem the buyer reported.";
  if (order.release_state === "releasing") return `Available on ${dayMonth(order.release_at)}.`;
  if (order.release_state === "not_released") {
    if (order.status === "paid") return order.fulfilment === "pickup" ? "Waiting for you to get it ready." : "Waiting for you to pack it.";
    if (order.status === "packed") return "Waiting for you to ship it.";
    return "Joins your balance once the order is complete.";
  }
  return "";
}

export const RELEASE_RULES = [
  "The buyer confirms they have it: straight away.",
  "Pickup, picked up with the code: straight away.",
  "Pickup, picked up without the code: 2 days later.",
  "Delivery, marked delivered by you: 2 days later.",
];

// A WhatsApp link for a Nigerian number: 0803 412 5185 becomes wa.me/2348034125185.
export function whatsappLink(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 7) return "";
  return `https://wa.me/${digits.startsWith("0") ? `234${digits.slice(1)}` : digits}`;
}
