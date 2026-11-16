import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "@/utils/axios";
import { toast } from "sonner";
import MerchOrders from "./MerchOrders";

vi.mock("@/utils/axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const row = (ref, over = {}) => ({
  ref, status: "paid", fulfilment: "delivery", buyer: { name: "Kelechi Obi", first: "Kelechi" },
  items: [{ name: "Community tee", option: "M", quantity: 1 }], subtotal: "12000.00", amount: "14000.00",
  paid_at: new Date().toISOString(), days_waiting: 0, on_hold: false, release_state: "not_released", release_at: null,
  late: "", auto_cancel_on: null, ...over,
});

const detail = (ref, over = {}) => ({
  ...row(ref), buyer: { name: "Kelechi Obi", first: "Kelechi", email: "k@example.com", phone: "0803 412 5185", note: "" },
  delivery_address: "12B Adebayo Street\nSurulere, Lagos", courier: "", tracking: "", pickup: null, pickup_code: null,
  delivery_fee: "2000.00", fee_rate: "0", fee: "0.00", earnings: "14000.00", refund_amount: "0.00", cancel_reason: "",
  steps: [{ key: "paid", label: "Paid", at: new Date().toISOString() }, { key: "packed", label: "Packed", at: null }, { key: "shipped", label: "Shipped", at: null }, { key: "delivered", label: "Delivered", at: null }],
  problem: null, can_cancel: true, can_cant_deliver: false, ...over,
});

const list = (results, counts, money = {}) => ({
  data: { results, counts: counts || { need: results.length, shipped: 0, done: 0, all: results.length }, money: { available: "0.00", releasing: "0.00", on_hold: "0.00", not_released: "0.00", ...money } },
});

const orders = [
  row("BY-0003", { fulfilment: "pickup", buyer: { name: "Tunde Bello", first: "Tunde" } }),
  row("BY-0002", { fulfilment: "pickup", buyer: { name: "Adaeze Okafor", first: "Adaeze" } }),
  row("BY-0001", { status: "packed", buyer: { name: "Chiamaka Eze", first: "Chiamaka" } }),
  row("BY-0004"), // a paid delivery
];

beforeEach(() => {
  axios.get.mockReset();
  axios.post.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

const show = async (payload = list(orders)) => {
  axios.get.mockImplementation((url) => {
    if (url === "dashboard/merch-orders/") return Promise.resolve(payload);
    const ref = url.split("/")[2];
    const r = payload.data.results.find((o) => o.ref === ref) || {};
    return Promise.resolve({ data: detail(ref, { status: r.status, fulfilment: r.fulfilment, ...(r.fulfilment === "pickup" ? { delivery_fee: "0.00", pickup: { address: "Cafe One", instructions: "" } } : {}) }) });
  });
  const user = userEvent.setup();
  render(<MerchOrders />);
  await screen.findByRole("table");
  return user;
};

describe("organiser orders list", () => {
  it("shows the orders with their type, status and the counts", async () => {
    await show(list(orders, { need: 3, shipped: 2, done: 5, all: 10 }, { available: "12000.00", releasing: "8000.00", on_hold: "3000.00" }));
    expect(screen.getByRole("button", { name: /Needs action\s*3/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Completed\s*5/ })).toBeInTheDocument();
    expect(screen.getAllByText("Pickup").length).toBeGreaterThan(0);
    expect(screen.getAllByText("To get ready")).toHaveLength(2);
    expect(screen.getByText("To ship")).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Summary" });
    expect(within(summary).getByText("₦12,000")).toBeInTheDocument();
    expect(within(summary).getByText("₦8,000")).toBeInTheDocument();
    expect(within(summary).getByText("₦3,000 on hold")).toBeInTheDocument();
    expect(within(summary).getByRole("link", { name: "Go to Payouts" })).toHaveAttribute("href", "/dashboard/payouts");
  });

  it("asks the server for the chosen filter and for searches", async () => {
    const user = await show();
    await user.click(screen.getByRole("button", { name: /Ready or shipped/ }));
    await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith("dashboard/merch-orders/", { params: { filter: "shipped", q: undefined } }));
    await user.type(screen.getByRole("searchbox", { name: "Search orders" }), "tunde");
    await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith("dashboard/merch-orders/", { params: { filter: "shipped", q: "tunde" } }));
  });

  it("flags orders that have waited, and the day Byro will cancel", async () => {
    await show(list([row("BY-0009", { late: "Waiting 5 days", auto_cancel_on: "2026-11-18T10:00:00Z", days_waiting: 11 })]));
    expect(screen.getByText("Waiting 5 days")).toBeInTheDocument();
    expect(screen.getByText("Byro cancels on 18 Nov")).toBeInTheDocument();
  });

  it("shows a problem as On hold", async () => {
    await show(list([row("BY-0009", { status: "shipped", on_hold: true })]));
    expect(screen.getByText("On hold")).toBeInTheDocument();
  });

  it("has a kind message for each empty case", async () => {
    axios.get.mockResolvedValue(list([], { need: 0, shipped: 0, done: 0, all: 0 }));
    const { unmount } = render(<MerchOrders />);
    expect(await screen.findByText("No orders yet")).toBeInTheDocument();
    unmount();
    axios.get.mockResolvedValue(list([], { need: 0, shipped: 1, done: 0, all: 1 }));
    render(<MerchOrders />);
    expect(await screen.findByText("Nothing to do right now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See all orders" })).toBeInTheDocument();
  });

  it("says when a search finds nothing", async () => {
    const user = await show();
    axios.get.mockResolvedValue(list([], { need: 3, shipped: 0, done: 0, all: 3 }));
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(await screen.findByText("No orders match “zzz”")).toBeInTheDocument();
  });

  it("offers a retry when the list can't load", async () => {
    axios.get.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(list(orders));
    const user = userEvent.setup();
    render(<MerchOrders />);
    expect(await screen.findByText("We couldn't load your orders")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });
});

describe("bulk", () => {
  it("moves selected orders at the same step together", async () => {
    axios.post.mockResolvedValue({ data: { done: ["BY-0003", "BY-0002"], failed: [] } });
    const user = await show();
    await user.click(screen.getByRole("checkbox", { name: "Select order BY-0003" }));
    await user.click(screen.getByRole("checkbox", { name: "Select order BY-0002" }));
    // An order at a different step can't join this group.
    expect(screen.getByRole("checkbox", { name: "Select order BY-0001" })).toBeDisabled();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark 2 ready for pickup" }));
    expect(screen.getByText(/Each buyer gets an email with the pickup address/)).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Mark 2 ready for pickup" }));
    expect(axios.post).toHaveBeenCalledWith("dashboard/merch-orders/bulk/", { action: "ready", refs: ["BY-0003", "BY-0002"], courier: "" });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("2 orders updated", expect.anything()));
    expect(screen.queryByText("2 selected")).not.toBeInTheDocument();
  });

  it("reports the orders it could not move", async () => {
    axios.post.mockResolvedValue({ data: { done: ["BY-0003"], failed: [{ ref: "BY-0002", error: "This order is not at the step before that one." }] } });
    const user = await show();
    await user.click(screen.getByRole("checkbox", { name: "Select order BY-0003" }));
    await user.click(screen.getByRole("checkbox", { name: "Select order BY-0002" }));
    await user.click(screen.getByRole("button", { name: "Mark 2 ready for pickup" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Mark 2 ready for pickup" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("1 could not be updated", { description: "This order is not at the step before that one." }));
  });

  it("asks for a courier when shipping several", async () => {
    axios.post.mockResolvedValue({ data: { done: ["BY-0001"], failed: [] } });
    const user = await show(list([row("BY-0001", { status: "packed" })]));
    await user.click(screen.getByRole("checkbox", { name: "Select order BY-0001" }));
    await user.click(screen.getByRole("button", { name: "Mark 1 as shipped" }));
    await user.type(screen.getByLabelText(/Courier for all/), "GIG Logistics");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Mark 1 as shipped" }));
    expect(axios.post).toHaveBeenCalledWith("dashboard/merch-orders/bulk/", { action: "ship", refs: ["BY-0001"], courier: "GIG Logistics" });
  });
});

describe("one order", () => {
  const open = async (user, ref = "BY-0003") => {
    await user.click(screen.getByRole("button", { name: new RegExp(`Open order ${ref}`) }));
    return screen.findByRole("dialog");
  };

  it("shows the buyer, the address and the money, and the next step", async () => {
    const user = await show();
    const dialog = await open(user, "BY-0004");
    expect(within(dialog).getByText("Next: pack the order")).toBeInTheDocument();
    expect(within(dialog).getByText("0803 412 5185")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/2348034125185");
    expect(within(dialog).getByText(/12B Adebayo Street/)).toBeInTheDocument();
    expect(within(dialog).getByText("+₦2,000")).toBeInTheDocument();
    expect(within(dialog).getByText("You get").nextSibling).toHaveTextContent("₦14,000");
    expect(within(dialog).queryByText(/Byro fee/)).not.toBeInTheDocument(); // no fee, no line
    expect(within(dialog).getByText("Joins your balance once the order is complete.")).toBeInTheDocument();
  });

  it("marks the next step and updates the list", async () => {
    axios.post.mockResolvedValue({ data: detail("BY-0004", { status: "packed" }) });
    const user = await show();
    const dialog = await open(user, "BY-0004");
    await user.click(within(dialog).getByRole("button", { name: "Mark as packed" }));
    expect(axios.post).toHaveBeenCalledWith("dashboard/merch-orders/BY-0004/action/", { action: "pack" });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(await within(dialog).findByText("Next: send it")).toBeInTheDocument();
  });

  it("shipping asks for optional courier details first", async () => {
    axios.post.mockResolvedValue({ data: detail("BY-0001", { status: "shipped" }) });
    const user = await show();
    const dialog = await open(user, "BY-0001");
    await user.click(within(dialog).getByRole("button", { name: "Mark as shipped" }));
    expect(within(dialog).getByText("Shipping details")).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/Courier/), "GIG Logistics");
    await user.type(within(dialog).getByLabelText(/Tracking number/), "GIG-48213377");
    await user.click(within(dialog).getByRole("button", { name: "Confirm shipped" }));
    expect(axios.post).toHaveBeenCalledWith("dashboard/merch-orders/BY-0001/action/", { action: "ship", courier: "GIG Logistics", tracking: "GIG-48213377" });
  });

  it("a pickup hand-over can use the buyer's code", async () => {
    axios.get.mockImplementation((url) => Promise.resolve(url === "dashboard/merch-orders/" ? list([row("BY-0005", { fulfilment: "pickup", status: "ready" })]) : { data: detail("BY-0005", { fulfilment: "pickup", status: "ready", delivery_fee: "0.00", pickup: { address: "Cafe One", instructions: "" }, pickup_code: "4821", steps: [{ key: "paid", label: "Paid", at: "2026-11-14T10:00:00Z" }, { key: "ready", label: "Ready for pickup", at: "2026-11-15T10:00:00Z" }, { key: "picked_up", label: "Picked up", at: null }] }) }));
    axios.post.mockResolvedValue({ data: detail("BY-0005", { fulfilment: "pickup", status: "picked_up" }) });
    const user = userEvent.setup();
    render(<MerchOrders />);
    await screen.findByRole("table");
    const dialog = await open(user, "BY-0005");
    await user.type(within(dialog).getByLabelText(/Code from Kelechi/), "48x21");
    expect(within(dialog).getByLabelText(/Code from Kelechi/)).toHaveValue("4821"); // digits only
    await user.click(within(dialog).getByRole("button", { name: "Mark as picked up" }));
    expect(axios.post).toHaveBeenCalledWith("dashboard/merch-orders/BY-0005/action/", { action: "picked_up", code: "4821" });
  });

  it("explains a refused step and keeps the order as it was", async () => {
    axios.post.mockRejectedValue({ response: { data: { error: "That code doesn't match this order." } } });
    const user = await show();
    const dialog = await open(user, "BY-0004");
    await user.click(within(dialog).getByRole("button", { name: "Mark as packed" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("That code doesn't match this order.");
  });

  it("cancel and refund shows items plus delivery, then sends the reason", async () => {
    axios.post.mockResolvedValue({ data: detail("BY-0004", { status: "refund_processing", refund_amount: "14000.00" }) });
    const user = await show();
    const dialog = await open(user, "BY-0004");
    await user.click(within(dialog).getByRole("button", { name: "Cancel and refund this order" }));
    const confirm = within(dialog).getByRole("region", { name: "Cancel and refund" });
    expect(confirm).toHaveTextContent("Kelechi gets ₦14,000 back (items ₦12,000 and delivery ₦2,000)");
    expect(confirm).toHaveTextContent("The items go back into your stock");
    await user.type(within(dialog).getByLabelText(/Reason for Kelechi/), "Sold out in your size");
    await user.click(within(dialog).getByRole("button", { name: "Cancel and refund ₦14,000" }));
    expect(axios.post).toHaveBeenCalledWith("dashboard/merch-orders/BY-0004/action/", { action: "cancel", reason: "Sold out in your size" });
    expect(await within(dialog).findByText("Cancelled, refund on its way")).toBeInTheDocument();
  });

  it("'Keep the order' backs out without sending anything", async () => {
    const user = await show();
    const dialog = await open(user);
    await user.click(within(dialog).getByRole("button", { name: "Cancel and refund this order" }));
    await user.click(within(dialog).getByRole("button", { name: "Keep the order" }));
    expect(axios.post).not.toHaveBeenCalled();
    expect(within(dialog).queryByText("Cancel and refund this order?")).not.toBeInTheDocument();
  });

  it("a shipped order offers 'Can't deliver' instead of cancel", async () => {
    axios.get.mockImplementation((url) => Promise.resolve(url === "dashboard/merch-orders/" ? list([row("BY-0006", { status: "shipped" })]) : { data: detail("BY-0006", { status: "shipped", can_cancel: false, can_cant_deliver: true }) }));
    axios.post.mockResolvedValue({ data: detail("BY-0006", { status: "refund_processing" }) });
    const user = userEvent.setup();
    render(<MerchOrders />);
    await screen.findByRole("table");
    const dialog = await open(user, "BY-0006");
    expect(within(dialog).queryByRole("button", { name: "Cancel and refund this order" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Can't deliver this order" }));
    expect(within(dialog).getByText(/The items are not added back to your stock/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /^Cancel and refund/ }));
    expect(axios.post).toHaveBeenCalledWith("dashboard/merch-orders/BY-0006/action/", { action: "cant_deliver", reason: "" });
  });

  it("shows a buyer's reported problem and that earnings are on hold", async () => {
    axios.get.mockImplementation((url) => Promise.resolve(url === "dashboard/merch-orders/" ? list([row("BY-0007", { status: "shipped", on_hold: true })]) : { data: detail("BY-0007", { status: "shipped", on_hold: true, release_state: "on_hold", can_cancel: false, can_cant_deliver: true, problem: { reason: "not_received", note: "Nothing came", at: "2026-11-15T10:00:00Z", resolved: false, outcome: "" } }) }));
    const user = userEvent.setup();
    render(<MerchOrders />);
    await screen.findByRole("table");
    const dialog = await open(user, "BY-0007");
    expect(within(dialog).getByText(/Kelechi reported a problem: Not received/)).toBeInTheDocument();
    expect(within(dialog).getByText("“Nothing came”")).toBeInTheDocument();
    expect(within(dialog).getByText(/Byro is reviewing this/)).toBeInTheDocument();
    expect(within(dialog).getByText("On hold while Byro reviews a problem Kelechi reported.")).toBeInTheDocument();
  });

  it("copies the packing slip and the address, and closes with Escape", async () => {
    const user = await show();
    const dialog = await open(user);
    const write = vi.spyOn(navigator.clipboard, "writeText");   // user-event installs its own clipboard
    await user.click(within(dialog).getByRole("button", { name: "Copy packing slip" }));
    expect(write).toHaveBeenCalledWith(expect.stringContaining("Order BY-0003"));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
