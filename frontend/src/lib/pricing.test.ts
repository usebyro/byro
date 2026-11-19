import { describe, expect, it } from "vitest";
import { calculateTicketFees } from "./pricing";

describe("calculateTicketFees", () => {
  it("estimates Paystack's fee when no provider is given", () => {
    const f = calculateTicketFees(5000, true, 0.05);
    expect(f.total).toBe(5250);
    expect(f.paystackFee).toBeCloseTo(181.47, 2);
    expect(f.displayTotal).toBeCloseTo(5431.47, 2);
  });

  it("keeps the Paystack estimate when Paystack is the provider", () => {
    expect(calculateTicketFees(5000, true, 0.05, "paystack")).toEqual(calculateTicketFees(5000, true, 0.05));
  });

  it("estimates Bachs' fee on top of total at the card rate", () => {
    const f = calculateTicketFees(10000, true, 0.03, "bachs");
    expect(f.serviceFee).toBe(300);
    expect(f.total).toBe(10300);
    expect(f.processorFee).toBe(206); // 2% of 10,300
    expect(f.displayTotal).toBe(10506);
  });

  it("charges the buyer only the ticket plus Bachs' fee when the organiser absorbs Byro's fee", () => {
    const f = calculateTicketFees(10000, false, 0.03, "bachs");
    expect(f.total).toBe(10000);
    expect(f.displayTotal).toBe(10200);
  });

  it("is all zeroes for a free order", () => {
    expect(calculateTicketFees(0, true, 0.05, "bachs").displayTotal).toBe(0);
  });
});
