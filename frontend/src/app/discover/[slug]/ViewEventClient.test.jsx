import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ViewEventClient from "./ViewEventClient";
import API from "@/services/api";

const nav = vi.hoisted(() => ({ query: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.query),
  notFound: vi.fn(),
}));
vi.mock("@/redux/Providers", () => ({ Providers: ({ children }) => <>{children}</> }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/ReportButton", () => ({ default: () => null }));
vi.mock("@/components/ShareMenu", () => ({ default: () => null }));
vi.mock("@/components/checkout/CheckoutModal", () => ({
  default: ({ initialTierId, initialQty }) => (
    <div data-testid="checkout" data-tier={initialTierId ?? ""} data-qty={initialQty ?? ""} />
  ),
}));
vi.mock("@/components/events/EventPublishedModal", () => ({ default: () => null }));
vi.mock("@/lib/analytics", () => ({
  trackViewItem: vi.fn(), trackShare: vi.fn(), trackSaveEvent: vi.fn(), ticketItem: vi.fn(() => ({})),
}));
vi.mock("@/services/api", () => ({
  default: {
    getEvent: vi.fn(), getMyTicket: vi.fn(), getEventTiers: vi.fn(), getEvents: vi.fn(),
  },
}));

const NOW = new Date("2026-11-20T12:00:00Z");

const event = (over = {}) => ({
  id: 7, slug: "paint-yap", name: "Paint & Yap", category: "art_culture", description: "An evening of painting.",
  day: "2026-11-28", time_from: "15:00:00", time_to: "18:00:00", timezone: "Africa/Lagos",
  location: "Abuja", ticket_price: "10000.00", tiers: [], owner_handle: "the-buj-playhouse", owner_name: "The Buj Playhouse",
  is_active: true, ...over,
});

function open(e) {
  API.getEvent.mockResolvedValue(e);
  API.getMyTicket.mockResolvedValue({ registered: false });
  API.getEventTiers.mockResolvedValue([]);
  API.getEvents.mockResolvedValue([]);
  return render(<ViewEventClient slug={e.slug} initialEvent={e} />);
}

beforeEach(() => {
  nav.query = "";
  nav.replace.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("event page: upcoming", () => {
  it("sells tickets and shows no ended or cancelled banner", () => {
    open(event());
    expect(screen.getAllByRole("button", { name: "Get tickets" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("This event has ended.")).not.toBeInTheDocument();
    expect(screen.queryByText("This event was cancelled.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Browse upcoming events" })).not.toBeInTheDocument();
  });

  it("still sells when there is no end time and the start is in the future", () => {
    open(event({ time_to: null }));
    expect(screen.getAllByRole("button", { name: "Get tickets" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("This event has ended.")).not.toBeInTheDocument();
  });

  it("does not call an event with an unreadable date ended", () => {
    open(event({ day: "", time_from: "", time_to: "" }));
    expect(screen.queryByText("This event has ended.")).not.toBeInTheDocument();
  });
});

describe("event page: finish-my-order link", () => {
  it("opens checkout with the tier and quantity from the email, then tidies the address", () => {
    nav.query = "tier=12&qty=2";
    open(event());
    const checkout = screen.getByTestId("checkout");
    expect(checkout).toHaveAttribute("data-tier", "12");
    expect(checkout).toHaveAttribute("data-qty", "2");
    expect(nav.replace).toHaveBeenCalledWith("/discover/paint-yap", { scroll: false });
  });

  it("does not open checkout for an event that has ended", () => {
    nav.query = "tier=12&qty=2";
    open(event({ day: "2026-11-10" }));
    expect(screen.queryByTestId("checkout")).not.toBeInTheDocument();
  });

  it("does nothing without the link parameters", () => {
    open(event());
    expect(screen.queryByTestId("checkout")).not.toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe("event page: ended", () => {
  const ended = () => event({ day: "2026-11-10" });

  it("shows the banner, with Discover first and the host's page second", () => {
    open(ended());
    expect(screen.getAllByText("This event has ended.").length).toBeGreaterThan(0);
    const browse = screen.getAllByRole("link", { name: "Browse upcoming events" });
    expect(browse.length).toBeGreaterThan(0);
    browse.forEach((a) => expect(a).toHaveAttribute("href", "/discover"));
    expect(screen.getAllByRole("link", { name: "More from @the-buj-playhouse" })[0]).toHaveAttribute("href", "/u/the-buj-playhouse");
  });

  it("removes the ticket buttons and the price", () => {
    open(ended());
    expect(screen.queryByRole("button", { name: /get tickets|register/i })).not.toBeInTheDocument();
    expect(screen.queryByText("₦10,000")).not.toBeInTheDocument();
  });

  it("leaves out the host link when the host has no profile", () => {
    open({ ...ended(), owner_handle: null });
    expect(screen.queryByRole("link", { name: /More from/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Browse upcoming events" }).length).toBeGreaterThan(0);
  });

  it("ends at the event's own end time, not the visitor's clock", () => {
    // 19:30 UTC on the day is 20:30 in Lagos, after an 18:00 end.
    vi.setSystemTime(new Date("2026-11-28T19:30:00Z"));
    open(event());
    expect(screen.getAllByText("This event has ended.").length).toBeGreaterThan(0);
  });

  it("is still on sale at 17:30 in Lagos, before the 18:00 end", () => {
    vi.setSystemTime(new Date("2026-11-28T16:30:00Z"));
    open(event());
    expect(screen.queryByText("This event has ended.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Get tickets" }).length).toBeGreaterThan(0);
  });
});

describe("event page: cancelled", () => {
  it("shows the cancelled banner and no ticket buttons", () => {
    open(event({ cancelled_at: "2026-11-15T09:00:00Z", cancel_reason: "Venue unavailable" }));
    expect(screen.getAllByText("This event was cancelled.").length).toBeGreaterThan(0);
    expect(screen.getByText("Venue unavailable")).toBeInTheDocument();
    expect(screen.queryByText("This event has ended.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /get tickets|register/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Browse upcoming events" })[0]).toHaveAttribute("href", "/discover");
  });
});
