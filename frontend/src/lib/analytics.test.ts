import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GA_MEASUREMENT_ID,
  generateTransactionId,
  isStaffArea,
  itemsValue,
  merchItem,
  setAnalyticsDisabled,
  setAnalyticsUserId,
  ticketItem,
  trackAddToCart,
  trackBeginCheckout,
  trackCreateEvent,
  trackEvent,
  trackFollow,
  trackFreeTicket,
  trackLogin,
  trackPurchase,
  trackSaveEvent,
  trackShare,
  trackSignUp,
  trackViewItem,
} from "./analytics";

const EVENT = { id: 42, name: "Lagos Jazz Night", category: "music" };
const sent = () => (window as unknown as { gtag: ReturnType<typeof vi.fn> }).gtag.mock.calls;
const lastEvent = () => {
  const calls = sent().filter((c: unknown[]) => c[0] === "event");
  return calls[calls.length - 1] as [string, string, Record<string, unknown>];
};

beforeEach(() => {
  (window as unknown as { gtag: unknown }).gtag = vi.fn();
  setAnalyticsDisabled(false);
  window.localStorage.clear();
});
afterEach(() => {
  delete (window as unknown as { gtag?: unknown }).gtag;
  setAnalyticsDisabled(false);
});

describe("trackEvent", () => {
  it("is a no-op when gtag isn't loaded", () => {
    delete (window as unknown as { gtag?: unknown }).gtag;
    expect(trackEvent("anything", { a: 1 })).toBe(false);
  });

  it("drops undefined values and personal-looking params", () => {
    trackEvent("x", { keep: 1, gone: undefined, email: "a@b.com", customer_name: "Ada", attendee_phone: "1", item_name: "ok" });
    expect(lastEvent()[2]).toEqual({ keep: 1, item_name: "ok" });
  });

  it("cleans inside items too", () => {
    trackEvent("x", { items: [{ item_id: "1", item_variant: undefined, price: 5 }] });
    expect(lastEvent()[2]).toEqual({ items: [{ item_id: "1", price: 5 }] });
  });

  it("sends nothing while analytics is disabled (staff pages)", () => {
    setAnalyticsDisabled(true);
    expect(trackEvent("view_item")).toBe(false);
    expect(sent()).toHaveLength(0);
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`]).toBe(true);
  });
});

describe("isStaffArea", () => {
  it("flags the admin subdomain and /admin paths only", () => {
    expect(isStaffArea("admin.usebyro.com", "/payouts")).toBe(true);
    expect(isStaffArea("www.usebyro.com", "/admin")).toBe(true);
    expect(isStaffArea("www.usebyro.com", "/admin/users")).toBe(true);
    expect(isStaffArea("www.usebyro.com", "/dashboard/events")).toBe(false);
    expect(isStaffArea("www.usebyro.com", "/administrators")).toBe(false);
  });
});

describe("items", () => {
  it("builds a ticket item with the event id, category and tier as variant", () => {
    expect(ticketItem(EVENT, { name: "VIP", price: "5000.00" }, 2)).toEqual({
      item_id: "42", item_name: "Lagos Jazz Night", item_category: "music", item_variant: "VIP", price: 5000, quantity: 2,
    });
  });

  it("namespaces merch ids so they can't collide with events", () => {
    const item = merchItem({ id: 42, name: "Tee", price: "8000" }, 1, "L");
    expect(item).toMatchObject({ item_id: "merch_42", item_category: "merch", item_variant: "L", price: 8000 });
  });

  it("totals price × quantity", () => {
    expect(itemsValue([ticketItem(EVENT, { price: 1000 }, 2), ticketItem(EVENT, { price: 500 }, 1)])).toBe(2500);
  });
});

describe("funnel", () => {
  const items = [ticketItem(EVENT, { name: "VIP", price: 5000 }, 2)];

  it("view_item carries items, currency and the event context, and no required value", () => {
    trackViewItem({ items, eventId: 42, eventSlug: "jazz", organiserId: 7 });
    expect(lastEvent()[1]).toBe("view_item");
    expect(lastEvent()[2]).toEqual({ currency: "NGN", items, event_id: 42, event_slug: "jazz", organiser_id: 7 });
  });

  it("add_to_cart defaults value to the items total", () => {
    trackAddToCart({ items });
    expect(lastEvent()[2]).toMatchObject({ currency: "NGN", value: 10000, items });
  });

  it("begin_checkout sends the amount to be charged, not the item total, and the service fee apart", () => {
    trackBeginCheckout({ items, value: 10650, serviceFee: 650 });
    expect(lastEvent()[1]).toBe("begin_checkout");
    expect(lastEvent()[2]).toMatchObject({ value: 10650, service_fee: 650, currency: "NGN", items });
  });

  it("begin_checkout leaves service_fee out when it isn't known", () => {
    trackBeginCheckout({ items, value: 10650 });
    expect(lastEvent()[2]).not.toHaveProperty("service_fee");
  });
});

describe("purchase", () => {
  const items = [ticketItem(EVENT, { name: "VIP", price: 5000 }, 2)];
  const order = { transactionId: "ref_123", items, value: 10650, eventId: 42, eventSlug: "jazz" };

  it("sends the ecommerce params, with the service fee kept inside value and sent apart", () => {
    expect(trackPurchase({ ...order, serviceFee: 650 })).toBe(true);
    expect(lastEvent()[1]).toBe("purchase");
    expect(lastEvent()[2]).toMatchObject({ transaction_id: "ref_123", value: 10650, service_fee: 650, currency: "NGN", items });
  });

  it("sends once per order, even on a reload or a repeat", () => {
    expect(trackPurchase(order)).toBe(true);
    expect(trackPurchase(order)).toBe(false);
    expect(sent().filter((c: unknown[]) => c[1] === "purchase")).toHaveLength(1);
  });

  it("still sends a different order", () => {
    trackPurchase(order);
    expect(trackPurchase({ ...order, transactionId: "ref_456" })).toBe(true);
  });

  it("doesn't use up the order when GA isn't loaded", () => {
    delete (window as unknown as { gtag?: unknown }).gtag;
    expect(trackPurchase(order)).toBe(false);
    (window as unknown as { gtag: unknown }).gtag = vi.fn();
    expect(trackPurchase(order)).toBe(true);
  });

  it("refuses an order with no id", () => {
    expect(trackPurchase({ ...order, transactionId: "" })).toBe(false);
  });
});

describe("free_ticket", () => {
  const items = [ticketItem(EVENT, { name: "General admission", price: 0 }, 1)];

  it("is its own event with value 0 and the real ticket id", () => {
    trackFreeTicket({ transactionId: "tkt-1", items });
    expect(lastEvent()[1]).toBe("free_ticket");
    expect(lastEvent()[2]).toMatchObject({ transaction_id: "tkt-1", value: 0, currency: "NGN", items });
  });

  it("generates a unique id when there is none, never a shared literal", () => {
    trackFreeTicket({ items });
    const first = lastEvent()[2].transaction_id as string;
    trackFreeTicket({ items });
    const second = lastEvent()[2].transaction_id as string;
    expect(first).toMatch(/^free_/);
    expect(first).not.toBe("free");
    expect(first).not.toBe(second);
    expect(generateTransactionId()).not.toBe(generateTransactionId());
  });
});

describe("share, save, follow, create", () => {
  it("share sends the event id as item_id and the slug separately", () => {
    trackShare({ method: "whatsapp", contentType: "event", itemId: 42, eventSlug: "jazz" });
    expect(lastEvent()).toEqual(["event", "share", { method: "whatsapp", content_type: "event", item_id: "42", event_slug: "jazz" }]);
  });

  it("save_event uses event_id and organiser_id", () => {
    trackSaveEvent({ eventId: 42, eventSlug: "jazz", organiserId: 7 });
    expect(lastEvent()[2]).toEqual({ event_id: 42, event_slug: "jazz", organiser_id: 7 });
  });

  it("follow and unfollow are separate events", () => {
    trackFollow({ handle: "lagosjazz", following: true });
    expect(lastEvent().slice(1)).toEqual(["follow", { content_type: "community", organiser_handle: "lagosjazz" }]);
    trackFollow({ handle: "lagosjazz", following: false, organiserId: 7 });
    expect(lastEvent()[1]).toBe("unfollow");
    expect(lastEvent()[2]).toMatchObject({ organiser_id: 7 });
  });

  it("create_event carries the event id, slug and category", () => {
    trackCreateEvent({ eventId: 42, eventSlug: "jazz", category: "music" });
    expect(lastEvent()[2]).toEqual({ event_id: 42, event_slug: "jazz", event_category: "music" });
  });

  it("sign_up and login carry the method", () => {
    trackSignUp("email");
    expect(lastEvent().slice(1)).toEqual(["sign_up", { method: "email" }]);
    trackLogin("google");
    expect(lastEvent().slice(1)).toEqual(["login", { method: "google" }]);
  });
});

describe("user_id", () => {
  it("sets the internal id as a string and clears it with null", () => {
    setAnalyticsUserId(1234);
    expect(sent().at(-1)).toEqual(["set", { user_id: "1234" }]);
    setAnalyticsUserId(null);
    expect(sent().at(-1)).toEqual(["set", { user_id: null }]);
  });
});
