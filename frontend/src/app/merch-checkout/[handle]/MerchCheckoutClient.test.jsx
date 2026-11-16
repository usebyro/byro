import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "@/utils/axios";
import { readCart, writeCart } from "@/lib/merchCart";
import MerchCheckoutClient from "./MerchCheckoutClient";

vi.mock("@/utils/axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/redux/useAuth", () => ({ useAuth: () => ({ user: null, ready: true }) }));

const profile = (over = {}) => ({
  handle: "lagosrun", display_name: "Lagos Run Club",
  merch_checkout: {
    enabled: true,
    pickup: { address: "Cafe One, Yaba", instructions: "Ask for Tunde." },
    delivery: { enabled: true, area: "Lagos only", fee: "2000.00" },
  },
  merch_items: [
    { id: 1, name: "Community tee", price: "12000.00", stock: 5, options: ["M", "L"] },
    { id: 2, name: "Sticker pack", price: "2500.00", stock: null, options: [] },
  ],
  ...over,
});

const setup = async (p = profile(), cart = [{ item_id: 1, option: "M", quantity: 1 }, { item_id: 2, option: "", quantity: 2 }]) => {
  writeCart("lagosrun", cart);
  axios.get.mockResolvedValue({ data: p });
  const user = userEvent.setup();
  render(<MerchCheckoutClient handle="lagosrun" />);
  await waitFor(() => expect(screen.queryByLabelText("Loading checkout")).not.toBeInTheDocument());
  return user;
};

const fill = async (user, details = {}) => {
  const d = { name: "Kelechi Obi", email: "kelechi@example.com", phone: "08034125185", ...details };
  await user.type(screen.getByLabelText("Full name"), d.name);
  await user.type(screen.getByLabelText("Email"), d.email);
  if (d.phone) await user.type(screen.getByLabelText(/^Phone/), d.phone);
};

beforeEach(() => {
  axios.get.mockReset();
  axios.post.mockReset();
});

describe("merch checkout", () => {
  it("shows the cart, pickup by default, and what it costs", async () => {
    await setup();
    const summary = screen.getByRole("complementary", { name: "Order summary" });
    const lines = within(summary).getAllByRole("listitem");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent("Community tee (M)");
    expect(lines[0]).toHaveTextContent("₦12,000");
    expect(lines[1]).toHaveTextContent("Sticker pack");
    expect(lines[1]).toHaveTextContent("₦5,000");
    expect(within(summary).getByText("Items").nextSibling).toHaveTextContent("₦17,000");
    expect(within(summary).getByText("Pickup").nextSibling).toHaveTextContent("Free");
    expect(screen.getByRole("heading", { name: "Pick up from" })).toBeInTheDocument();
    expect(screen.getAllByText("Cafe One, Yaba").length).toBeGreaterThan(0);
    expect(screen.getByRole("radio", { name: /Pick up/ })).toHaveAttribute("aria-checked", "true");
    // Paystack's own charge is added on top of the items: 1.5% of 17,000 plus the flat 100.
    expect(within(summary).getByText("Payment charge (estimate)").nextSibling).toHaveTextContent("₦");
    expect(screen.getByRole("button", { name: /^Pay ₦17,/ })).toBeInTheDocument();
  });

  it("switching to delivery asks for an address and adds the fee", async () => {
    const user = await setup();
    await user.click(screen.getByRole("radio", { name: /Deliver to me/ }));
    expect(screen.getByLabelText("Delivery address")).toBeInTheDocument();
    expect(screen.getByText("This address is in Lagos.")).toBeInTheDocument();
    const summary = screen.getByRole("complementary", { name: "Order summary" });
    expect(within(summary).getByText("Delivery").nextSibling).toHaveTextContent("₦2,000");
    expect(screen.getByRole("button", { name: /^Pay ₦19,/ })).toBeInTheDocument();
  });

  it("the choice works with the arrow keys", async () => {
    const user = await setup();
    screen.getByRole("radio", { name: /Pick up/ }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /Deliver to me/ })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("radio", { name: /Pick up/ })).toHaveAttribute("aria-checked", "true");
  });

  it("only offers pickup when the seller has delivery off", async () => {
    await setup(profile({ merch_checkout: { enabled: true, pickup: { address: "Cafe One", instructions: "" }, delivery: { enabled: false } } }));
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pick up your order" })).toBeInTheDocument();
    expect(screen.getByText("Pickup only · Free")).toBeInTheDocument();
  });

  it("explains each missing detail instead of failing silently", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: /^Pay/ }));
    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByText(/That email doesn't look right/)).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("takes focus to the first thing to fix", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: /^Pay/ }));
    expect(screen.getByLabelText("Full name")).toHaveFocus();
    await user.type(screen.getByLabelText("Full name"), "Kelechi Obi");
    await user.click(screen.getByRole("button", { name: /^Pay/ }));
    expect(screen.getByLabelText("Email")).toHaveFocus();
  });

  it("for delivery the address comes first, then the area, then the details", async () => {
    const user = await setup();
    await user.click(screen.getByRole("radio", { name: /Deliver to me/ }));
    await fill(user);
    await user.click(screen.getByRole("button", { name: /^Pay/ }));
    expect(screen.getByLabelText("Delivery address")).toHaveFocus();
    await user.type(screen.getByLabelText("Delivery address"), "12B Adebayo Street, Surulere");
    await user.click(screen.getByRole("button", { name: /^Pay/ }));
    expect(screen.getByRole("checkbox", { name: /This address is in Lagos/ })).toHaveFocus();
  });

  it("for delivery, Pay says why it is off until the area is ticked, then turns on", async () => {
    const user = await setup();
    await user.click(screen.getByRole("radio", { name: /Deliver to me/ }));
    const pay = screen.getByRole("button", { name: /^Pay/ });
    expect(pay).toHaveAttribute("aria-disabled", "true");
    expect(pay).toHaveAccessibleDescription("Tick “This address is in Lagos” to pay.");
    await user.click(screen.getByRole("checkbox", { name: /This address is in Lagos/ }));
    expect(pay).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText("Tick “This address is in Lagos” to pay.")).not.toBeInTheDocument();
  });

  it("shows the total next to Pay for phones, which keep Pay in a bar at the bottom", async () => {
    await setup();
    const bar = screen.getByRole("button", { name: /^Pay/ }).parentElement;
    expect(bar).toHaveClass("max-sm:fixed", "max-sm:bottom-0");
    expect(within(bar).getByText("Total")).toBeInTheDocument();
  });

  it("offers pickup and delivery as two cards with their price and place", async () => {
    await setup();
    const pick = screen.getByRole("radio", { name: /Pick up/ });
    const del = screen.getByRole("radio", { name: /Deliver to me/ });
    expect(pick).toHaveTextContent("Free");
    expect(pick).toHaveTextContent("Cafe One, Yaba");
    expect(del).toHaveTextContent("₦2,000");
    expect(del).toHaveTextContent("Lagos only");
    expect(pick.parentElement).toHaveClass("sm:grid-cols-2");
  });

  it("does not look disabled until they have tried to pay", async () => {
    const user = await setup();
    const pay = screen.getByRole("button", { name: /^Pay/ });
    expect(pay).not.toHaveAttribute("aria-disabled");
    await user.click(pay);
    expect(pay).toHaveAttribute("aria-disabled", "true");
  });

  it("quantity and remove are 44px to tap", async () => {
    await setup();
    for (const button of screen.getAllByRole("button", { name: /One more|One fewer/ })) {
      expect(button).toHaveClass("h-11", "w-11");
    }
    for (const button of screen.getAllByRole("button", { name: /^Remove/ })) {
      expect(button).toHaveClass("min-h-11");
    }
  });

  it("says the payment charge is an estimate", async () => {
    await setup();
    expect(screen.getByText("Payment charge (estimate)")).toBeInTheDocument();
  });

  it("has a way to skip to the content", async () => {
    await setup();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
    expect(document.getElementById("main")).not.toBeNull();
  });

  it("delivery also needs a full address, a phone number and the area confirmed", async () => {
    const user = await setup();
    await user.click(screen.getByRole("radio", { name: /Deliver to me/ }));
    await fill(user, { phone: "" });
    await user.click(screen.getByRole("button", { name: /^Pay/ }));
    expect(await screen.findByText("Enter your full delivery address.")).toBeInTheDocument();
    expect(screen.getByText(/Enter a phone number the seller can call/)).toBeInTheDocument();
    expect(screen.getByText("Confirm your address is in Lagos to pay.")).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("pays: sends the order and goes to Paystack", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, writable: true });
    axios.post.mockResolvedValue({ data: { authorization_url: "https://pay.example/abc" } });
    const user = await setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: /^Pay/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://pay.example/abc"));
    expect(axios.post).toHaveBeenCalledWith("merch-orders/checkout/", expect.objectContaining({
      handle: "lagosrun", fulfilment: "pickup", name: "Kelechi Obi", email: "kelechi@example.com",
      items: [{ item_id: 1, quantity: 1, option: "M" }, { item_id: 2, quantity: 2, option: "" }],
    }));
  });

  it("shows the server's reason when it refuses", async () => {
    axios.post.mockRejectedValue({ response: { data: { error: "Community tee is sold out." } } });
    const user = await setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: /^Pay/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Community tee is sold out.");
    expect(screen.getByRole("button", { name: /^Pay/ })).toBeEnabled();
  });

  it("changes quantity and removes lines, and remembers the cart", async () => {
    const user = await setup();
    const summary = screen.getByRole("complementary", { name: "Order summary" });
    await user.click(within(summary).getAllByRole("button", { name: "One more" })[1]);
    expect(readCart("lagosrun")[1].quantity).toBe(3);
    await user.click(within(summary).getByRole("button", { name: /Remove\s*Sticker pack/ }));
    expect(readCart("lagosrun")).toHaveLength(1);
  });

  it("blocks paying for an item that has sold out or been taken down", async () => {
    const user = await setup(profile({ merch_items: [{ id: 1, name: "Community tee", price: "12000.00", stock: 0, options: ["M"] }] }), [
      { item_id: 1, option: "M", quantity: 1 }, { item_id: 9, option: "", quantity: 1 },
    ]);
    expect(screen.getByText("Sold out")).toBeInTheDocument();
    expect(screen.getByText("No longer available")).toBeInTheDocument();
    await fill(user);
    await user.click(screen.getByRole("button", { name: /^Pay/ }));
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("handles a seller who is not taking payments, an empty cart and an unknown seller", async () => {
    await setup(profile({ merch_checkout: { enabled: false } }));
    expect(await screen.findByText(/isn't taking payments yet/)).toBeInTheDocument();
  });

  it("an empty cart sends them back to the merch", async () => {
    await setup(profile(), []);
    expect(await screen.findByRole("heading", { name: "Your order is empty" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to merch" })).toHaveAttribute("href", "/u/lagosrun");
  });

  it("an unknown seller says so", async () => {
    axios.get.mockRejectedValue(new Error("404"));
    render(<MerchCheckoutClient handle="nobody" />);
    expect(await screen.findByText("We couldn't find that seller")).toBeInTheDocument();
  });
});
