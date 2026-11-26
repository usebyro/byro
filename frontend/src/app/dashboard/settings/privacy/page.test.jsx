import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PrivacySettings from "./page";
import API from "@/services/api";

const nav = vi.hoisted(() => ({ query: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/consent", () => ({ openCookieSettings: vi.fn() }));
vi.mock("@/services/api", () => ({
  default: { getPrivacy: vi.fn(), updatePrivacy: vi.fn(), requestDataExport: vi.fn(), downloadDataExport: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  nav.query = "";
  API.getPrivacy.mockResolvedValue({ listed: true, show_passport: true });
});

describe("Settings > Privacy", () => {
  it("turns directory listing off", async () => {
    API.updatePrivacy.mockResolvedValue({ listed: false, show_passport: true });
    render(<PrivacySettings />);
    await userEvent.click(await screen.findByRole("switch", { name: "List your community on the communities page" }));
    expect(API.updatePrivacy).toHaveBeenCalledWith({ listed: false });
  });

  it("hides the passport", async () => {
    API.updatePrivacy.mockResolvedValue({ listed: true, show_passport: false });
    render(<PrivacySettings />);
    await userEvent.click(await screen.findByRole("switch", { name: "Show your passport on your profile" }));
    expect(API.updatePrivacy).toHaveBeenCalledWith({ show_passport: false });
  });

  it("puts a switch back when saving fails", async () => {
    API.updatePrivacy.mockRejectedValue(new Error("nope"));
    render(<PrivacySettings />);
    const sw = await screen.findByRole("switch", { name: /communities page/ });
    await userEvent.click(sw);
    await waitFor(() => expect(screen.getByRole("switch", { name: /communities page/ })).toHaveAttribute("aria-checked", "true"));
  });

  it("asks for the download link by email", async () => {
    API.requestDataExport.mockResolvedValue({ sent: true });
    render(<PrivacySettings />);
    await userEvent.click(await screen.findByRole("button", { name: "Request download" }));
    expect(API.requestDataExport).toHaveBeenCalled();
  });

  it("downloads the zip when opened from the emailed link, then cleans the address", async () => {
    nav.query = "export=tok123";
    API.downloadDataExport.mockResolvedValue(new Blob(["zip"]));
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    render(<PrivacySettings />);
    await waitFor(() => expect(API.downloadDataExport).toHaveBeenCalledWith("tok123"));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/dashboard/settings/privacy"));
  });
});
