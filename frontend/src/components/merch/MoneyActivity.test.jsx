import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "@/utils/axios";
import MoneyActivity, { signedNaira } from "./MoneyActivity";

vi.mock("@/utils/axios", () => ({ default: { get: vi.fn() } }));

const row = (source, amount, description, detail = "", at = "2026-11-10T10:00:00Z", status) => ({ source, amount, description, detail, at, ...(status ? { status } : {}) });
const feed = [
  row("withdrawals", "-5000.00", "Payout to GTBank ••••4821", "", "2026-11-14T10:00:00Z", "paid"),
  row("merch", "12000.00", "Merch order BY-0007 released", "Kelechi", "2026-11-13T10:00:00Z"),
  row("tickets", "10000.00", "2 tickets sold", "Run Day", "2026-11-12T10:00:00Z"),
  row("refunds", "-5000.00", "Refund to a buyer", "Run Day", "2026-11-11T10:00:00Z"),
];

beforeEach(() => axios.get.mockReset());

describe("signedNaira", () => {
  it("marks money in and money out", () => {
    expect(signedNaira("12000.00")).toBe("+₦12,000");
    expect(signedNaira("-5000.00")).toBe("−₦5,000");
    expect(signedNaira(0)).toBe("+₦0");
  });
});

describe("money activity", () => {
  it("lists what moved the balance with a sign and a source", async () => {
    axios.get.mockResolvedValue({ data: { results: feed } });
    render(<MoneyActivity />);
    expect(await screen.findByText("Merch order BY-0007 released")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Payout to GTBank ••••4821");
    expect(items[0]).toHaveTextContent("−₦5,000");
    expect(items[1]).toHaveTextContent("+₦12,000");
    expect(items[1]).toHaveTextContent("Kelechi");
    expect(items[2]).toHaveTextContent("Run Day");
    expect(axios.get).toHaveBeenCalledWith("payouts/activity/");
  });

  it("filters by source and counts each", async () => {
    axios.get.mockResolvedValue({ data: { results: feed } });
    const user = userEvent.setup();
    render(<MoneyActivity />);
    await screen.findByText("2 tickets sold");
    expect(screen.getByRole("button", { name: /All\s*4/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Merch\s*1/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /Refunds\s*1/ }));
    expect(screen.getByText("Refund to a buyer")).toBeInTheDocument();
    expect(screen.queryByText("2 tickets sold")).not.toBeInTheDocument();
  });

  it("shows six at a time", async () => {
    const many = Array.from({ length: 14 }, (_, i) => row("tickets", "1000.00", `${i + 1} ticket sold`));
    axios.get.mockResolvedValue({ data: { results: many } });
    const user = userEvent.setup();
    render(<MoneyActivity />);
    await screen.findByText("1 ticket sold");
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(14);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("explains an empty list, and retries when it can't load", async () => {
    axios.get.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ data: { results: [] } });
    const user = userEvent.setup();
    render(<MoneyActivity />);
    expect(await screen.findByText("We couldn't load your activity")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Nothing yet\. Ticket sales, merch orders and payouts/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter activity" })).not.toBeInTheDocument();
  });

  it("says where each payout stands, and only counts the ones that took money out", async () => {
    const payouts = [
      row("withdrawals", "-9000.00", "Payout to GTBank ••••4821", "", "2026-11-16T10:00:00Z", "pending"),
      row("withdrawals", "-8000.00", "Payout to GTBank ••••4821", "", "2026-11-15T10:00:00Z", "on_hold"),
      row("withdrawals", "-7000.00", "Payout to GTBank ••••4821", "", "2026-11-14T10:00:00Z", "unpaid"),
      row("withdrawals", "-6000.00", "Payout to GTBank ••••4821", "", "2026-11-13T10:00:00Z", "paid"),
    ];
    axios.get.mockResolvedValue({ data: { results: payouts } });
    const user = userEvent.setup();
    render(<MoneyActivity />);
    await screen.findAllByText("Payout to GTBank ••••4821");
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Pending. Sent on the next working day");
    expect(items[0]).toHaveTextContent("−₦9,000");
    expect(items[1]).toHaveTextContent("On hold. Byro is reviewing it");
    expect(items[2]).toHaveTextContent("Unpaid. Returned to your balance");
    expect(items[2]).toHaveTextContent("₦7,000");
    expect(items[2]).not.toHaveTextContent("−₦7,000");
    expect(items[3]).toHaveTextContent("Paid");
    await user.click(screen.getByRole("button", { name: /Payouts\s*4/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("keeps the weekday note and a way to reach support under the list", async () => {
    axios.get.mockResolvedValue({ data: { results: feed } });
    render(<MoneyActivity />);
    await screen.findByText("2 tickets sold");
    expect(screen.getByText("Payouts are sent on the next working day, on weekdays only.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email support" })).toHaveAttribute("href", "mailto:support@usebyro.com");
  });
});
