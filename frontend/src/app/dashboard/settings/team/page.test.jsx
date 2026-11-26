import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TeamSettings from "./page";
import API from "@/services/api";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/services/api", () => ({
  default: { getTeam: vi.fn(), inviteTeamMember: vi.fn(), updateTeamMember: vi.fn(), removeTeamMember: vi.fn() },
}));

const roles = [
  { role: "owner", label: "Owner", can: "Everything, plus payouts, bank account and deleting the community." },
  { role: "manager", label: "Co-host", can: "Create and edit events, see sales and guests, message followers, check people in." },
  { role: "checkin", label: "Door staff", can: "Check people in at the door. Nothing else." },
];
const owner = { name: "Sam Ajayi", email: "sam@gdgocunilag.org" };
const ada = { id: 1, name: "Ada Obi", email: "ada@example.com", role: "manager", role_label: "Co-host", pending: false };
const team = (members = [ada]) => ({ owner, members, roles });

beforeEach(() => {
  vi.clearAllMocks();
  API.getTeam.mockResolvedValue(team());
});

describe("Settings > Team", () => {
  it("lists the owner, the members with their role, and what each role can do", async () => {
    render(<TeamSettings />);
    expect(await screen.findByText("Owner", { selector: ".s-deftag" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Ada Obi, Co-host" })).toBeInTheDocument();
    expect(screen.getByText("Check people in at the door. Nothing else.")).toBeInTheDocument();
  });

  it("marks someone who has not signed up yet as invited", async () => {
    API.getTeam.mockResolvedValue(team([{ ...ada, pending: true }]));
    render(<TeamSettings />);
    expect(await screen.findByRole("button", { name: /Manage Ada Obi, Co-host, invited/ })).toBeInTheDocument();
  });

  it("invites someone as door staff", async () => {
    const door = { id: 2, name: "bo@example.com", email: "bo@example.com", role: "checkin", role_label: "Door staff", pending: true };
    API.inviteTeamMember.mockResolvedValue(team([ada, door]));
    render(<TeamSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "Invite someone" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Email"), "bo@example.com");
    await userEvent.click(within(dialog).getByRole("radio", { name: /Door staff/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invite" }));
    expect(API.inviteTeamMember).toHaveBeenCalledWith("bo@example.com", "checkin");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Manage bo@example.com, Door staff/ })).toBeInTheDocument();
  });

  it("keeps the dialog open and says why when the invite is refused", async () => {
    API.inviteTeamMember.mockRejectedValue(new Error("They are already on your team."));
    render(<TeamSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "Invite someone" }));
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("They are already on your team.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("changes a role from the manage dialog", async () => {
    API.updateTeamMember.mockResolvedValue(team([{ ...ada, role: "checkin", role_label: "Door staff" }]));
    render(<TeamSettings />);
    await userEvent.click(await screen.findByRole("button", { name: /Manage Ada Obi/ }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("radio", { name: /Door staff/ }));
    expect(API.updateTeamMember).toHaveBeenCalledWith(1, "checkin");
  });

  it("removes someone from the team", async () => {
    API.removeTeamMember.mockResolvedValue(team([]));
    render(<TeamSettings />);
    await userEvent.click(await screen.findByRole("button", { name: /Manage Ada Obi/ }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove from team" }));
    expect(API.removeTeamMember).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Escape closes a dialog", async () => {
    render(<TeamSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "Invite someone" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
