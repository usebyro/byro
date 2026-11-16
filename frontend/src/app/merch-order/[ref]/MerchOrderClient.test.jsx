import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "@/utils/axios";
import { readCart, writeCart } from "@/lib/merchCart";
import MerchOrderClient from "./MerchOrderClient";

vi.mock("@/utils/axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const steps = (kind, done) => (kind === "pickup"
  ? [["paid", "Paid"], ["ready", "Ready for pickup"], ["picked_up", "Picked up"]]
  : [["paid", "Paid"], ["packed", "Packed"], ["shipped", "Shipped"], ["delivered", "Delivered"]]
).map(([key, label], i) => ({ key, label, at: i < done ? "2026-11-14T10:00:00Z" : null }));

const order = (over = {}) => ({
  ref: "BY-0007", status: "paid", fulfilment: "pickup", seller: { name: "Lagos Run Club", handle: "lagosrun" },
  items: [{ name: "Community tee", option: "M", quantity: 1, total: "12000.00" }],
  subtotal: "12000.00", delivery_fee: "0.00", amount: "12000.00", refund_amount: "0.00", cancel_reason: "",
  paid_at: "2026-11-12T10:00:00Z", steps: steps("pickup", 1),
  pickup: { address: "Cafe One, Yaba", instructions: "Ask for Tunde." }, pickup_code: null, delivery: null,
  courier: "", tracking: "", problem: null, can_report: true, report_until: null, can_confirm: false, ...over,
});

const open = (search) => {
  window.history.pushState({}, "", `/merch-order/BY-0007${search}`);
  return render(<MerchOrderClient orderRef="BY-0007" />);
};

beforeEach(() => {
  axios.get.mockReset();
  axios.post.mockReset();
});

describe("buyer's order page", () => {
  it("opens with the key and shows where to collect and what is next", async () => {
    axios.get.mockResolvedValue({ data: order() });
    open("?token=abc123");
    expect(await screen.findByRole("heading", { name: "Your order is in" })).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith("merch-orders/BY-0007/", { params: { token: "abc123" } });
    expect(screen.getByText("Cafe One, Yaba")).toBeInTheDocument();
    expect(screen.getByText("Ask for Tunde.")).toBeInTheDocument();
    expect(screen.getByLabelText("Order progress")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lagos Run Club" })).toHaveAttribute("href", "/u/lagosrun");
  });

  it("has a skip link, and promises no deadline it can't keep", async () => {
    axios.get.mockResolvedValue({ data: order({ problem: { reason: "damaged", resolved: false }, can_report: false }) });
    open("?token=abc");
    await screen.findByText("You reported a problem: Damaged.");
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
    expect(screen.getByText(/We'll email you when Byro has decided/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("within 2 working days");
  });

  it("labels where to collect it, with Maps and the instructions", async () => {
    axios.get.mockResolvedValue({ data: order() });
    open("?token=abc");
    expect(await screen.findByRole("heading", { name: "Collect from" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open in Maps/ })).toHaveAttribute("href", expect.stringContaining("Cafe%20One%2C%20Yaba"));
    expect(screen.getByRole("heading", { name: "Instructions" })).toBeInTheDocument();
    expect(screen.getByText(/Order BY-0007 · Paid 12 Nov/)).toBeInTheDocument();
    expect(screen.queryByText(/Changed on/)).not.toBeInTheDocument();
  });

  it("says when the organiser moved the pickup after the order, and where it was", async () => {
    axios.get.mockResolvedValue({ data: order({ pickup: { address: "Hub 2, Akoka Road", instructions: "", changed_at: "2026-11-14T10:00:00Z", previous_address: "Cafe One, Herbert Macaulay Way" } }) });
    open("?token=abc");
    expect(await screen.findByText("Changed on 14 Nov. It was Cafe One, Herbert Macaulay Way.")).toBeInTheDocument();
    expect(screen.getByText("Hub 2, Akoka Road")).toBeInTheDocument();
  });

  it("without a key it says it can't find the order", async () => {
    open("");
    expect(await screen.findByRole("heading", { name: "We couldn't find that order" })).toBeInTheDocument();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("a wrong key looks the same as no order", async () => {
    axios.get.mockRejectedValue({ response: { status: 404 } });
    open("?token=nope");
    expect(await screen.findByRole("heading", { name: "We couldn't find that order" })).toBeInTheDocument();
  });

  it("shows the pickup code once the order is ready, and lets them confirm", async () => {
    axios.get.mockResolvedValue({ data: order({ status: "ready", pickup_code: "4821", steps: steps("pickup", 2), can_confirm: true }) });
    axios.post.mockResolvedValue({ data: order({ status: "picked_up", steps: steps("pickup", 3), can_confirm: false, can_report: true }) });
    const user = userEvent.setup();
    open("?token=abc");
    expect(await screen.findByText("4821")).toBeInTheDocument();
    expect(screen.getByText("Show this or your order number when you collect.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your order is ready to collect" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "I collected it" }));
    expect(axios.post).toHaveBeenCalledWith("merch-orders/BY-0007/confirm/", { token: "abc" });
    expect(await screen.findByRole("heading", { name: "Collected" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I collected it" })).not.toBeInTheDocument();
  });

  it("a delivery shows the address, tracking and 'I received it'", async () => {
    axios.get.mockResolvedValue({ data: order({
      fulfilment: "delivery", status: "shipped", steps: steps("delivery", 3), pickup: null,
      delivery: { name: "Kelechi Obi", phone: "0803", address: "12B Adebayo Street" },
      courier: "GIG Logistics", tracking: "GIG-1", can_confirm: true,
    }) });
    open("?token=abc");
    expect(await screen.findByRole("heading", { name: "Your order is on the way" })).toBeInTheDocument();
    expect(screen.getByText(/12B Adebayo Street/)).toBeInTheDocument();
    expect(screen.getByText("GIG Logistics")).toBeInTheDocument();
    expect(screen.getByText("GIG-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I received it" })).toBeInTheDocument();
  });

  it("reports a problem with a reason and shows it was sent", async () => {
    axios.get.mockResolvedValue({ data: order({ status: "shipped", fulfilment: "delivery", steps: steps("delivery", 3), pickup: null, delivery: { name: "K", phone: "", address: "A street" }, report_until: "2026-11-24T10:00:00Z", can_confirm: true }) });
    axios.post.mockResolvedValue({ data: order({ status: "shipped", fulfilment: "delivery", steps: steps("delivery", 3), pickup: null, delivery: { name: "K", phone: "", address: "A street" }, problem: { reason: "not_received", resolved: false }, can_report: false }) });
    const user = userEvent.setup();
    open("?token=abc");
    const report = await screen.findByRole("button", { name: "Report a problem" });
    expect(screen.getByText(/You can report a problem until 24 Nov/)).toBeInTheDocument();
    await user.click(report);
    const send = screen.getByRole("button", { name: "Send report" });
    expect(send).toBeDisabled(); // a reason comes first
    await user.click(screen.getByRole("radio", { name: "Not received" }));
    await user.type(screen.getByLabelText(/Tell us more/), "Nothing came");
    await user.click(send);
    expect(axios.post).toHaveBeenCalledWith("merch-orders/BY-0007/report/", { token: "abc", reason: "not_received", note: "Nothing came" });
    expect(await screen.findByText("You reported a problem: Not received.")).toBeInTheDocument();
    expect(screen.getByText(/We've told Lagos Run Club and Byro/)).toBeInTheDocument();
  });

  it("explains when a report is refused", async () => {
    axios.get.mockResolvedValue({ data: order({ status: "ready", pickup_code: "1111", steps: steps("pickup", 2) }) });
    axios.post.mockRejectedValue({ response: { data: { error: "The time to report a problem on this order has passed. Email support@usebyro.com." } } });
    const user = userEvent.setup();
    open("?token=abc");
    await user.click(await screen.findByRole("button", { name: "Report a problem" }));
    await user.click(screen.getByRole("radio", { name: "Damaged" }));
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("has passed");
  });

  it("a cancelled order shows the refund instead of the steps", async () => {
    axios.get.mockResolvedValue({ data: order({ status: "refund_processing", refund_amount: "14000.00", cancel_reason: "Sold out in your size", can_report: false }) });
    open("?token=abc");
    expect(await screen.findByRole("heading", { name: "Your order was cancelled" })).toBeInTheDocument();
    expect(screen.getByText(/₦14,000 goes back to the card or bank account/)).toBeInTheDocument();
    expect(screen.getByText(/Sold out in your size/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Order progress")).not.toBeInTheDocument();
  });
});

describe("coming back from Paystack", () => {
  it("confirms the payment, shows the order and empties the cart", async () => {
    writeCart("lagosrun", [{ item_id: 1, quantity: 1 }]);
    axios.get.mockResolvedValue({ data: { status: "success", token: "tok9", order: order() } });
    open("?token=tok9&trxref=MRC-1&reference=MRC-1");
    expect(await screen.findByRole("heading", { name: "Your order is in" })).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith("merch-orders/verify/MRC-1/");
    expect(readCart("lagosrun")).toEqual([]);
  });

  it("still finds the reference when Paystack's own query runs into ours", async () => {
    axios.get.mockResolvedValue({ data: { status: "success", token: "tok9", order: order() } });
    open("?token=tok9?trxref=MRC-2&reference=MRC-2");
    await screen.findByRole("heading", { name: "Your order is in" });
    expect(axios.get).toHaveBeenCalledWith("merch-orders/verify/MRC-2/");
  });

  it("says it is confirming while Paystack is still working", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    axios.get
      .mockRejectedValueOnce({ response: { status: 202, data: { status: "processing" } } })
      .mockResolvedValueOnce({ data: { status: "success", token: "t", order: order() } });
    open("?token=t&reference=MRC-3");
    expect(await screen.findByRole("heading", { name: "Confirming your payment" })).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(4500);
    expect(await screen.findByRole("heading", { name: "Your order is in" })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("a failed payment says nobody was charged", async () => {
    axios.get.mockRejectedValue({ response: { status: 400, data: { status: "failed" } } });
    open("?token=t&reference=MRC-4");
    expect(await screen.findByRole("heading", { name: "Your payment didn't go through" })).toBeInTheDocument();
    expect(screen.getByText(/haven't been charged/)).toBeInTheDocument();
  });

  it("a payment it can't confirm points to support with the reference", async () => {
    axios.get.mockRejectedValue({ response: { status: 400, data: { error: "We couldn't confirm your payment. Contact support@usebyro.com with reference MRC-5 and we'll sort it out." } } });
    open("?token=t&reference=MRC-5");
    expect(await screen.findByRole("heading", { name: /still confirming/ })).toBeInTheDocument();
    expect(screen.getByText(/reference MRC-5/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument());
  });
});
