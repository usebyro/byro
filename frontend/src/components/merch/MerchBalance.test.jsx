import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "@/utils/axios";
import { withdrawBlockedLine, merchFigures, heldOrderLine } from "@/lib/merchOrders";
import { BalanceBreakdown, MerchFigures, ShortfallNotice } from "./MerchBalance";

vi.mock("@/utils/axios", () => ({ default: { get: vi.fn() } }));

const merch = (over = {}) => ({ releasing: "0.00", on_hold: "0.00", not_released: "0.00", next_release_at: null, ...over });

beforeEach(() => axios.get.mockReset());

describe("merch figures", () => {
  it("shows only the buckets that have money, with a line each", () => {
    render(<MerchFigures merch={merch({ releasing: "13400.00", not_released: "14000.00", next_release_at: "2026-11-17T09:00:00Z" })} />);
    expect(screen.getByText("Releasing soon")).toBeInTheDocument();
    expect(screen.getByText("₦13,400")).toBeInTheDocument();
    expect(screen.getByText("Next release 17 Nov")).toBeInTheDocument();
    expect(screen.getByText("Not yet released")).toBeInTheDocument();
    expect(screen.queryByText("On hold")).not.toBeInTheDocument();
  });

  it("shows nothing at all for an organiser with no merch money, so ticket-only pages stay as they were", () => {
    const { container } = render(<MerchFigures merch={merch()} />);
    expect(container).toBeEmptyDOMElement();
    expect(merchFigures(undefined)).toEqual([]);
  });
});

describe("shortfall notice", () => {
  it("explains a balance taken below zero by a refund", () => {
    render(<ShortfallNotice shortfall="2375.00" />);
    expect(screen.getByRole("status")).toHaveTextContent("₦2,375 from a refunded order is being taken from your next earnings.");
    expect(screen.getByRole("status")).toHaveTextContent("above ₦0");
  });
  it("stays away when there is none", () => {
    const { container } = render(<ShortfallNotice shortfall="0" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("why Withdraw is off", () => {
  it("says when the next money arrives", () => {
    expect(withdrawBlockedLine({ available: "0", shortfall: "0", merch: merch({ releasing: "13400", next_release_at: "2026-11-17T09:00:00Z" }) }))
      .toBe("Nothing to withdraw yet. Your next merch money arrives on 17 Nov.");
  });
  it("says when orders are being reviewed", () => {
    expect(withdrawBlockedLine({ available: "0", shortfall: "0", merch: merch({ on_hold: "5000" }) })).toBe("Nothing to withdraw yet. Byro is reviewing a merch order.");
  });
  it("explains a negative balance, and what is coming", () => {
    expect(withdrawBlockedLine({ available: "0", shortfall: "2375", merch: merch() })).toBe("Withdraw is off until your balance is above ₦0.");
    expect(withdrawBlockedLine({ available: "0", shortfall: "2375", merch: merch({ releasing: "22900", next_release_at: "2026-11-17T09:00:00Z" }) }))
      .toBe("Withdraw is off until your balance is above ₦0. ₦22,900 is releasing soon, the next on 17 Nov.");
  });
  it("says nothing when there is money to withdraw, or nothing to explain", () => {
    expect(withdrawBlockedLine({ available: "12000", shortfall: "0", merch: merch({ releasing: "5000" }) })).toBe("");
    expect(withdrawBlockedLine({ available: "0", shortfall: "0", merch: merch() })).toBe("");
    expect(withdrawBlockedLine(null)).toBe("");
  });
});

describe("one line per held order", () => {
  it("says where each order's money is", () => {
    expect(heldOrderLine({ on_hold: true })).toMatch(/On hold while Byro reviews/);
    expect(heldOrderLine({ release_state: "releasing", release_at: "2026-11-24T09:00:00Z" })).toBe("Releases on 24 Nov.");
    expect(heldOrderLine({ release_state: "not_released", status: "paid", fulfilment: "pickup" })).toBe("Waiting for you to get it ready.");
    expect(heldOrderLine({ release_state: "not_released", status: "paid", fulfilment: "delivery" })).toBe("Waiting for you to pack it.");
    expect(heldOrderLine({ release_state: "not_released", status: "packed", fulfilment: "delivery" })).toBe("Waiting for you to ship it.");
  });
});

describe("what's in your balance", () => {
  const order = (ref, over = {}) => ({ ref, status: "ready", fulfilment: "pickup", buyer: { first: "Tunde" }, items: [{ name: "Community tee", option: "M", quantity: 1 }], earnings: "12000.00", on_hold: false, release_state: "releasing", release_at: "2026-11-24T09:00:00Z", ...over });

  it("lists the rules and the orders behind the held money, linking to them", async () => {
    axios.get.mockResolvedValue({ data: { orders: [order("BY-0002"), order("BY-0003", { on_hold: true, release_state: "on_hold" })], order_count: 2, merch: {} } });
    render(<BalanceBreakdown balance={{ merch: merch({ releasing: "12000", on_hold: "12000" }) }} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "What's in your balance" });
    expect(within(dialog).getByText("Ticket money is available as soon as a ticket is sold.")).toBeInTheDocument();
    expect(within(dialog).getByText("Pickup, picked up with the code: straight away.")).toBeInTheDocument();
    expect(within(dialog).getByText("Delivery, never marked delivered: 10 days after Shipped.")).toBeInTheDocument();
    expect(await within(dialog).findByText("Releases on 24 Nov.")).toBeInTheDocument();
    expect(within(dialog).getByText("On hold while Byro reviews a problem the buyer reported.")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("link", { name: /Tunde/ })[0]).toHaveAttribute("href", "/dashboard/merch?tab=orders");
    expect(axios.get).toHaveBeenCalledWith("dashboard/merch-orders/balance/");
  });

  it("caps the list and offers the rest", async () => {
    const many = Array.from({ length: 8 }, (_, i) => order(`BY-00${10 + i}`));
    axios.get.mockResolvedValue({ data: { orders: many, order_count: 8, merch: {} } });
    render(<BalanceBreakdown balance={{ merch: merch({ releasing: "96000" }) }} onClose={() => {}} />);
    expect(await screen.findByRole("link", { name: "See all 8 orders" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").filter((li) => li.textContent.includes("BY-00"))).toHaveLength(5);
  });

  it("says so when nothing is waiting, retries on failure, and closes with Escape", async () => {
    axios.get.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ data: { orders: [], order_count: 0, merch: {} } });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<BalanceBreakdown balance={{ merch: merch() }} onClose={onClose} />);
    expect(await screen.findByText("We couldn't load these orders")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No merch orders are waiting.")).toBeInTheDocument();
    expect(screen.getByText(/Nothing is waiting/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
