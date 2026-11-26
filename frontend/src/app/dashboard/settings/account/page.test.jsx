import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountSettings from "./page";
import { ConfirmProvider } from "@/components/admin/ui";
import API from "@/services/api";

const nav = vi.hoisted(() => ({ push: vi.fn(), dispatch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock("react-redux", () => ({ useDispatch: () => nav.dispatch }));
vi.mock("@/redux/auth/authSlice", () => ({ signOut: () => ({ type: "signOut" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/services/api", () => ({
  default: {
    getAccount: vi.fn(), updateAccount: vi.fn(), getSessions: vi.fn(), signOutSession: vi.fn(),
    signOutOtherSessions: vi.fn(), getDeleteBlockers: vi.fn(), deleteAccount: vi.fn(),
  },
}));

const account = { name: "Sam Ajayi", email: "sam@gdgocunilag.org", timezone: "Africa/Lagos" };
const sessions = [
  { id: "s1", name: "iPhone · Safari", current: true, last_active: "2026-11-20T10:00:00Z" },
  { id: "s2", name: "Mac · Chrome", current: false, last_active: "2026-11-19T10:00:00Z" },
];

const show = () => render(<ConfirmProvider><AccountSettings /></ConfirmProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  API.getAccount.mockResolvedValue(account);
  API.getSessions.mockResolvedValue({ sessions });
  API.getDeleteBlockers.mockResolvedValue({ blockers: [] });
});

describe("Settings > Account", () => {
  it("shows the email as text with the support-led way to change it, and no change button", async () => {
    show();
    expect(await screen.findByTestId("acct-email")).toHaveTextContent("sam@gdgocunilag.org");
    expect(screen.getByRole("link", { name: "support@usebyro.com" })).toHaveAttribute("href", "mailto:support@usebyro.com");
    expect(screen.queryByRole("button", { name: /change|request/i })).not.toBeInTheDocument();
  });

  it("saves a changed name", async () => {
    API.updateAccount.mockResolvedValue({ ...account, name: "Samuel Ajayi" });
    show();
    const input = await screen.findByLabelText("Your name");
    await userEvent.clear(input);
    await userEvent.type(input, "Samuel Ajayi");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(API.updateAccount).toHaveBeenCalledWith({ name: "Samuel Ajayi" });
  });

  it("saves a new time zone straight away", async () => {
    API.updateAccount.mockResolvedValue({ ...account, timezone: "Africa/Accra" });
    show();
    await userEvent.selectOptions(await screen.findByLabelText("Time zone"), "Africa/Accra");
    expect(API.updateAccount).toHaveBeenCalledWith({ timezone: "Africa/Accra" });
  });

  it("marks this device and signs another one out", async () => {
    API.signOutSession.mockResolvedValue({ ok: true });
    show();
    expect(await screen.findByText("This device")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(API.signOutSession).toHaveBeenCalledWith("s2");
    await waitFor(() => expect(screen.queryByText("Mac · Chrome")).not.toBeInTheDocument());
  });

  it("signs out everywhere else", async () => {
    API.signOutOtherSessions.mockResolvedValue({ ok: true });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out everywhere else" }));
    expect(API.signOutOtherSessions).toHaveBeenCalled();
  });

  it("explains why the account can't be deleted yet", async () => {
    API.getDeleteBlockers.mockResolvedValue({ blockers: ["You have upcoming events with tickets sold (Tech Meetup). Cancel or finish them first."] });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Delete account" }));
    expect(await screen.findByText(/upcoming events with tickets sold/)).toBeInTheDocument();
    expect(API.deleteAccount).not.toHaveBeenCalled();
  });

  it("deletes after the email is typed, then signs out", async () => {
    API.deleteAccount.mockResolvedValue({ deleted: true });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Delete account" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "sam@gdgocunilag.org");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(API.deleteAccount).toHaveBeenCalledWith("sam@gdgocunilag.org"));
    expect(nav.dispatch).toHaveBeenCalledWith({ type: "signOut" });
    expect(nav.push).toHaveBeenCalledWith("/");
  });
});
