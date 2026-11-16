import { describe, expect, it } from "vitest";
import { BULK_LABEL, bulkKey, itemsText, naira, nextStep, packingSlip, releaseLine, statusOf } from "./merchOrders";

const order = (over = {}) => ({
  ref: "BY-0007", status: "paid", fulfilment: "delivery", on_hold: false, release_state: "not_released", release_at: null,
  buyer: { first: "Kelechi", name: "Kelechi Obi", phone: "0803 412 5185", note: "" },
  items: [{ name: "Community tee", option: "M", quantity: 2 }, { name: "Dev cap", option: "", quantity: 1 }],
  delivery_address: "12B Adebayo Street, Surulere", ...over,
});

describe("naira", () => {
  it("formats whole naira with separators and tolerates blanks", () => {
    expect(naira("12000.00")).toBe("₦12,000");
    expect(naira(null)).toBe("₦0");
    expect(naira(1234567)).toBe("₦1,234,567");
  });
});

describe("statusOf", () => {
  it("says what comes next for a paid order, by kind", () => {
    expect(statusOf(order())[0]).toBe("To pack");
    expect(statusOf(order({ fulfilment: "pickup" }))[0]).toBe("To get ready");
    expect(statusOf(order({ status: "packed" }))[0]).toBe("To ship");
  });
  it("puts a problem ahead of everything else", () => {
    expect(statusOf(order({ status: "shipped", on_hold: true }))[0]).toBe("On hold");
  });
  it("covers the end states", () => {
    expect(statusOf(order({ status: "picked_up" }))[0]).toBe("Picked up");
    expect(statusOf(order({ status: "refund_processing" }))[0]).toBe("Refund on its way");
  });
});

describe("bulkKey", () => {
  it("groups orders only when the same step applies", () => {
    expect(bulkKey(order())).toBe("pack");
    expect(bulkKey(order({ status: "packed" }))).toBe("ship");
    expect(bulkKey(order({ fulfilment: "pickup" }))).toBe("ready");
  });
  it("is empty for orders with nothing to do in bulk", () => {
    expect(bulkKey(order({ status: "shipped" }))).toBe("");
    expect(bulkKey(order({ fulfilment: "pickup", status: "ready" }))).toBe("");
    expect(bulkKey(order({ status: "delivered" }))).toBe("");
  });
  it("labels each bulk step with the count", () => {
    expect(BULK_LABEL.pack(3)).toBe("Mark 3 as packed");
    expect(BULK_LABEL.ready(1)).toBe("Mark 1 ready for pickup");
  });
});

describe("nextStep", () => {
  it("walks a delivery through pack, ship, delivered", () => {
    expect(nextStep(order())[3]).toBe("pack");
    expect(nextStep(order({ status: "packed" }))[3]).toBe("ship");
    expect(nextStep(order({ status: "shipped" }))[3]).toBe("delivered");
  });
  it("walks a pickup through ready then picked up", () => {
    expect(nextStep(order({ fulfilment: "pickup" }))[3]).toBe("ready");
    expect(nextStep(order({ fulfilment: "pickup", status: "ready" }))[3]).toBe("picked_up");
  });
  it("has nothing for finished orders", () => {
    expect(nextStep(order({ status: "delivered" }))).toBeNull();
    expect(nextStep(order({ status: "refunded" }))).toBeNull();
  });
});

describe("releaseLine", () => {
  it("tells the organiser where the money is", () => {
    expect(releaseLine(order({ release_state: "available" }))).toBe("You can withdraw this now.");
    expect(releaseLine(order({ release_state: "releasing", release_at: "2026-11-24T09:00:00Z" }))).toMatch(/^Available on 24 Nov/);
    expect(releaseLine(order({ release_state: "on_hold" }))).toBe("On hold while Byro reviews a problem Kelechi reported.");
    expect(releaseLine(order({ release_state: "not_released" }))).toMatch(/once the order is complete/);
    expect(releaseLine(order({ release_state: "none" }))).toBe("");
  });
});

describe("dates", () => {
  it("show day and short month, from Intl, and tolerate blanks", async () => {
    const { dayMonth, shortDate, dateTime } = await import("./merchOrders");
    expect(dayMonth("2026-11-24T09:00:00Z")).toBe("24 Nov");
    expect(dayMonth("2026-03-03T09:00:00Z")).toBe("3 Mar");
    expect(dayMonth("")).toBe("");
    expect(shortDate("nonsense")).toBe("");
    expect(shortDate(new Date().toISOString())).toBe("Today");
    expect(dateTime("2026-11-24T09:15:00Z")).toMatch(/^24 Nov, \d{1,2}:15/);
  });
});

describe("text helpers", () => {
  it("lists items with options and quantities", () => {
    expect(itemsText(order())).toBe("Community tee (M) ×2, Dev cap");
  });
  it("builds a packing slip for each kind", () => {
    const slip = packingSlip(order({ buyer: { first: "Kelechi", name: "Kelechi Obi", phone: "0803", note: "Call first" } }));
    expect(slip).toContain("Order BY-0007");
    expect(slip).toContain("Deliver to: 12B Adebayo Street, Surulere");
    expect(slip).toContain("Note: Call first");
    expect(slip).toContain("2 × Community tee (M)");
    expect(packingSlip(order({ fulfilment: "pickup" }))).toContain("Pickup");
  });
});
