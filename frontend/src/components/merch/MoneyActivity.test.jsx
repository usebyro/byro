import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "@/utils/axios";
import MoneyActivity, { signedNaira } from "./MoneyActivity";

vi.mock("@/utils/axios", () => ({ default: { get: vi.fn() } }));

const row = (source, amount, description, detail = "", at = "2026-11-10T10:00:00Z") => ({ source, amount, description, detail, at });
const feed = [
  row("withdrawals", "-5000.00", "Withdrawal paid", "", "2026-11-14T10:00:00Z"),
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
    expect(items[0]).toHaveTextContent("Withdrawal paid");
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

  it("shows ten at a time", async () => {
    const many = Array.from({ length: 14 }, (_, i) => row("tickets", "1000.00", `${i + 1} ticket sold`));
    axios.get.mockResolvedValue({ data: { results: many } });
    const user = userEvent.setup();
    render(<MoneyActivity />);
    await screen.findByText("1 ticket sold");
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(14);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("explains an empty list, and retries when it can't load", async () => {
    axios.get.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ data: { results: [] } });
    const user = userEvent.setup();
    render(<MoneyActivity />);
    expect(await screen.findByText("We couldn't load your money activity")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Nothing yet\. Ticket sales, released merch money/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter activity" })).not.toBeInTheDocument();
  });
});
