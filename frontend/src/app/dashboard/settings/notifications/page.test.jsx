import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationSettings from "./page";
import API from "@/services/api";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/services/api", () => ({
  default: { getNotificationSettings: vi.fn(), updateNotificationSettings: vi.fn() },
}));

const prefs = (over = {}) => ({ muted: [], sale_email: "every", merch_email: "every", byro_picks: true, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  API.getNotificationSettings.mockResolvedValue(prefs());
});

describe("Settings > Notifications", () => {
  it("shows the sale email choice with Every sale selected", async () => {
    render(<NotificationSettings />);
    const every = await screen.findByRole("radio", { name: /Every sale/ });
    expect(every).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Off.*No sale emails/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: /Every order/ })).toHaveAttribute("aria-checked", "true");
  });

  it("saves a new sale email choice straight away", async () => {
    API.updateNotificationSettings.mockResolvedValue(prefs({ sale_email: "daily" }));
    render(<NotificationSettings />);
    await userEvent.click((await screen.findAllByRole("radio", { name: /Daily summary/ }))[0]);
    expect(API.updateNotificationSettings).toHaveBeenCalledWith({ sale_email: "daily" });
    await waitFor(() => expect(screen.getAllByRole("radio", { name: /Daily summary/ })[0]).toHaveAttribute("aria-checked", "true"));
  });

  it("turning a switch off sends the full list of turned-off kinds", async () => {
    API.updateNotificationSettings.mockResolvedValue(prefs({ muted: ["milestone_email"] }));
    render(<NotificationSettings />);
    await userEvent.click(await screen.findByRole("switch", { name: "Milestones" }));
    expect(API.updateNotificationSettings).toHaveBeenCalledWith({ muted: ["milestone_email"] });
  });

  it("Byro picks is saved as its own setting", async () => {
    API.updateNotificationSettings.mockResolvedValue(prefs({ byro_picks: false }));
    render(<NotificationSettings />);
    await userEvent.click(await screen.findByRole("switch", { name: "Byro picks" }));
    expect(API.updateNotificationSettings).toHaveBeenCalledWith({ byro_picks: false });
  });

  it("puts the switch back when saving fails", async () => {
    API.updateNotificationSettings.mockRejectedValue(new Error("nope"));
    render(<NotificationSettings />);
    const sw = await screen.findByRole("switch", { name: "Event reminders" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    await userEvent.click(sw);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Event reminders" })).toHaveAttribute("aria-checked", "true"));
  });
});
