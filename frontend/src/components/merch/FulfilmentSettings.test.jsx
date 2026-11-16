import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "@/utils/axios";
import { toast } from "sonner";
import FulfilmentSettings from "./FulfilmentSettings";

vi.mock("@/utils/axios", () => ({ default: { put: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const saved = (over = {}) => ({
  pickup_address: "Cafe One, 14 Herbert Macaulay Way, Yaba", pickup_instructions: "Ask for Tunde.",
  delivery_enabled: false, delivery_area: "", delivery_fee: "0.00", can_take_payment: true, ...over,
});

beforeEach(() => {
  axios.put.mockReset();
  toast.success.mockReset();
});

describe("how buyers get their order", () => {
  it("with no pickup address it says Buy is switched off and won't save", async () => {
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<FulfilmentSettings settings={saved({ pickup_address: "", can_take_payment: false })} onSaved={onSaved} />);
    expect(screen.getByText(/Buy is switched off/)).toBeInTheDocument();
    expect(screen.getAllByText(/Buy is off until you add a pickup address/).length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText("Pickup instructions (optional)"), "Weekdays");
    await user.click(screen.getByRole("button", { name: "Save how buyers get orders" }));
    expect(await screen.findByText("Add a pickup address so buyers know where to collect.")).toBeInTheDocument();
    expect(axios.put).not.toHaveBeenCalled();
  });

  it("shows what buyers will see as you type, and delivery only when it is on", async () => {
    const user = userEvent.setup();
    render(<FulfilmentSettings settings={saved()} />);
    const preview = screen.getByRole("complementary", { name: "What buyers see at checkout" });
    expect(preview).toHaveTextContent("Pick up");
    expect(preview).toHaveTextContent("Cafe One, 14 Herbert Macaulay Way");
    expect(preview).not.toHaveTextContent("Deliver to me");
    expect(screen.queryByLabelText(/Where you deliver/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Delivery" }));
    await user.type(screen.getByLabelText(/Where you deliver/), "Lagos only");
    await user.type(screen.getByLabelText("Delivery fee in naira"), "2000");
    expect(preview).toHaveTextContent("Deliver to me");
    expect(preview).toHaveTextContent("₦2,000");
    expect(preview).toHaveTextContent("Lagos only");
  });

  it("saves, and says how many buyers were told about a new address", async () => {
    const onSaved = vi.fn();
    axios.put.mockResolvedValue({ data: saved({ pickup_address: "Hub 2, Akoka", told_buyers: 3 }) });
    const user = userEvent.setup();
    render(<FulfilmentSettings settings={saved()} onSaved={onSaved} />);
    const save = screen.getByRole("button", { name: "Save how buyers get orders" });
    expect(save).toBeDisabled(); // nothing changed yet
    const address = screen.getByLabelText("Pickup address");
    await user.clear(address);
    await user.type(address, "Hub 2, Akoka");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await user.click(save);
    expect(axios.put).toHaveBeenCalledWith("dashboard/merch-orders/fulfilment/", expect.objectContaining({ pickup_address: "Hub 2, Akoka", delivery_enabled: false, delivery_fee: "0" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Saved", { description: "3 buyers were emailed the new pickup address." });
  });

  it("sends the delivery fee only when delivery is on", async () => {
    axios.put.mockResolvedValue({ data: saved({ delivery_enabled: true }) });
    const user = userEvent.setup();
    render(<FulfilmentSettings settings={saved({ delivery_enabled: true, delivery_area: "Lagos only", delivery_fee: "1500.00" })} />);
    expect(screen.getByLabelText("Delivery fee in naira")).toHaveValue("1500");
    await user.type(screen.getByLabelText("Delivery fee in naira"), "0");
    await user.click(screen.getByRole("button", { name: "Save how buyers get orders" }));
    expect(axios.put).toHaveBeenCalledWith("dashboard/merch-orders/fulfilment/", expect.objectContaining({ delivery_enabled: true, delivery_fee: "15000", delivery_area: "Lagos only" }));
  });

  it("only takes digits in the fee", async () => {
    const user = userEvent.setup();
    render(<FulfilmentSettings settings={saved({ delivery_enabled: true })} />);
    await user.type(screen.getByLabelText("Delivery fee in naira"), "₦2,5x00");
    expect(screen.getByLabelText("Delivery fee in naira")).toHaveValue("2500");
  });

  it("shows the server's reason when saving fails", async () => {
    axios.put.mockRejectedValue({ response: { data: { error: "Enter a delivery fee between 0 and 1,000,000." } } });
    const user = userEvent.setup();
    render(<FulfilmentSettings settings={saved({ delivery_enabled: true })} />);
    await user.type(screen.getByLabelText("Delivery fee in naira"), "5");
    await user.click(screen.getByRole("button", { name: "Save how buyers get orders" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a delivery fee between 0 and 1,000,000.");
  });
});
