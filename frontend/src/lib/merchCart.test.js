import { describe, expect, it } from "vitest";
import { MAX_QUANTITY, addToCart, cartCount, clearCart, readCart, writeCart } from "./merchCart";

describe("merch cart", () => {
  it("starts empty and survives bad stored data", () => {
    expect(readCart("lagosrun")).toEqual([]);
    window.localStorage.setItem("byro:merch-cart:lagosrun", "{not json");
    expect(readCart("lagosrun")).toEqual([]);
    window.localStorage.setItem("byro:merch-cart:lagosrun", JSON.stringify([{ item_id: "x", quantity: 1 }, { item_id: 3, quantity: 0 }, { item_id: 4, quantity: 2 }]));
    expect(readCart("lagosrun")).toEqual([{ item_id: 4, quantity: 2 }]);
  });

  it("adds new lines and merges the same item and option", () => {
    addToCart("lagosrun", { item_id: 1, option: "M", quantity: 1 });
    addToCart("lagosrun", { item_id: 1, option: "M", quantity: 2 });
    addToCart("lagosrun", { item_id: 1, option: "L", quantity: 1 });
    addToCart("lagosrun", { item_id: 2, quantity: 1 });
    expect(readCart("lagosrun")).toEqual([
      { item_id: 1, option: "M", quantity: 3 },
      { item_id: 1, option: "L", quantity: 1 },
      { item_id: 2, option: "", quantity: 1 },
    ]);
    expect(cartCount("lagosrun")).toBe(5);
  });

  it("never holds more than the limit of one item", () => {
    addToCart("lagosrun", { item_id: 1, quantity: MAX_QUANTITY });
    addToCart("lagosrun", { item_id: 1, quantity: 5 });
    expect(readCart("lagosrun")[0].quantity).toBe(MAX_QUANTITY);
  });

  it("keeps each seller's cart apart, whatever the handle's case", () => {
    addToCart("LagosRun", { item_id: 1, quantity: 1 });
    expect(readCart("lagosrun")).toHaveLength(1);
    expect(readCart("other")).toEqual([]);
  });

  it("clears", () => {
    writeCart("lagosrun", [{ item_id: 1, quantity: 1 }]);
    clearCart("lagosrun");
    expect(readCart("lagosrun")).toEqual([]);
  });
});
