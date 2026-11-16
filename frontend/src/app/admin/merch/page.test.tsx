import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmProvider } from "@/components/admin/ui";
import { AdminMeContext, type AdminMe } from "@/components/admin/AdminMe";
import AdminMerchPage from "./page";

const held = (over = {}) => ({
  ref: "BY-0007", status: "shipped", fulfilment: "delivery",
  buyer: { name: "Ngozi Umeh", first: "Ngozi", email: "ngozi@example.com", phone: "0803 412 5185", note: "" },
  seller: { name: "Lagos Run Club", handle: "lagosrun", email: "tunde@lagosrun.example" },
  items: [{ name: "Community tee", option: "M", quantity: 1 }],
  subtotal: "12000.00", delivery_fee: "2000.00", earnings: "14000.00", amount: "14000.00",
  courier: "GIG Logistics", tracking: "GIG-1", delivery_address: "12B Adebayo Street, Surulere",
  problem: { reason: "not_received", note: "Nothing came.", at: "2026-11-15T09:12:00Z" }, ...over,
});

const me = (payouts: boolean): AdminMe => ({ email: "boss@example.com", role: payouts ? "admin" : "viewer", can: { moderate: payouts, payouts, delete: false, manage_roles: false, manage_team: false } });

const respond = (data: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(data) } as Response);

const show = async (results = [held()], role = me(true)) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => (init?.method === "POST" ? respond({ ref: "BY-0007" }) : respond({ results })));
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  render(
    <AdminMeContext.Provider value={role}>
      <ConfirmProvider><AdminMerchPage /></ConfirmProvider>
    </AdminMeContext.Provider>,
  );
  await waitFor(() => expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument());
  return { user, fetchMock };
};

beforeEach(() => vi.unstubAllGlobals());

describe("admin merch problems", () => {
  it("shows what was reported, who is involved and what is on hold", async () => {
    await show();
    const order = await screen.findByRole("region", { name: "Order BY-0007" });
    expect(order).toHaveTextContent("Not received");
    expect(order).toHaveTextContent("“Nothing came.”");
    expect(order).toHaveTextContent("Ngozi Umeh");
    expect(order).toHaveTextContent("ngozi@example.com");
    expect(order).toHaveTextContent("Lagos Run Club");
    expect(order).toHaveTextContent("₦14,000");
    expect(order).toHaveTextContent("GIG Logistics, GIG-1");
  });

  it("gives a way to reach the buyer and the organiser", async () => {
    await show();
    const buyer = within(await screen.findByRole("group", { name: "Contact Ngozi Umeh" }));
    expect(buyer.getByRole("link", { name: "Email" })).toHaveAttribute("href", "mailto:ngozi@example.com");
    expect(buyer.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:08034125185");
    const wa = buyer.getByRole("link", { name: /WhatsApp/ });
    expect(wa).toHaveAttribute("href", "https://wa.me/2348034125185");
    expect(wa).toHaveAttribute("target", "_blank");
    const seller = within(screen.getByRole("group", { name: "Contact Lagos Run Club" }));
    expect(seller.getByRole("link", { name: "Email" })).toHaveAttribute("href", "mailto:tunde@lagosrun.example");
    expect(seller.queryByRole("link", { name: "Call" })).not.toBeInTheDocument();
  });

  it("says so when nothing is held", async () => {
    await show([]);
    expect(await screen.findByText("No merch orders have an open problem.")).toBeInTheDocument();
  });

  it("releasing asks first, then tells the server", async () => {
    const { user, fetchMock } = await show();
    await user.click(await screen.findByRole("button", { name: "Release to organiser" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Release ₦14,000 to Lagos Run Club?");
    await user.click(within(dialog).getByRole("button", { name: "Release the money" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/merch-orders/BY-0007/resolve", expect.objectContaining({ method: "POST", body: JSON.stringify({ outcome: "release" }) })));
    expect(await screen.findByText("BY-0007: earnings released to Lagos Run Club.")).toBeInTheDocument();
  });

  it("refunding shows items plus delivery and can be backed out of", async () => {
    const { user, fetchMock } = await show();
    await user.click(await screen.findByRole("button", { name: "Refund buyer" }));
    let dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Refund Ngozi ₦14,000?");
    expect(dialog).toHaveTextContent("items and delivery fee");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Refund buyer" }));
    dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Refund ₦14,000" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/merch-orders/BY-0007/resolve", expect.objectContaining({ body: JSON.stringify({ outcome: "refund" }) })));
    expect(await screen.findByText("BY-0007: refund started.")).toBeInTheDocument();
  });

  it("viewers can read but not decide", async () => {
    await show([held()], me(false));
    await screen.findByRole("region", { name: "Order BY-0007" });
    expect(screen.queryByRole("button", { name: "Release to organiser" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refund buyer" })).not.toBeInTheDocument();
    expect(screen.queryByText("Refund any order")).not.toBeInTheDocument();
  });

  it("shows the server's reason when a decision is refused", async () => {
    const { user, fetchMock } = await show();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method === "POST" ? respond({ error: "This order has no open problem." }, false) : respond({ results: [held()] })));
    await user.click(await screen.findByRole("button", { name: "Release to organiser" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Release the money" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This order has no open problem.");
  });

  it("refund any order checks the number and the reason, then asks", async () => {
    const { user, fetchMock } = await show([]);
    const submit = await screen.findByRole("button", { name: "Refund this order" });
    await user.type(screen.getByLabelText("Order number"), "12");
    await user.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter an order number like BY-K7M4QX.");
    await user.clear(screen.getByLabelText("Order number"));
    await user.type(screen.getByLabelText("Order number"), "by-0012");
    await user.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent("Add a reason.");
    await user.type(screen.getByLabelText(/Reason/), "Wrong size, buyer emailed");
    await user.click(submit);
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Refund the order" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/merch-orders/BY-0012/refund", expect.objectContaining({ body: JSON.stringify({ reason: "Wrong size, buyer emailed" }) })));
  });
});
