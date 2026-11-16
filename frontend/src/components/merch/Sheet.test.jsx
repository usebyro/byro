import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import Sheet from "./Sheet";

function Harness({ onClose = () => {} }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      <button>Behind the sheet</button>
      {open && (
        <Sheet title="Order BY-0007" subtitle="Paid today" onClose={() => { onClose(); setOpen(false); }}>
          <input aria-label="First field" />
          <button>Last button</button>
        </Sheet>
      )}
    </>
  );
}

describe("sheet", () => {
  it("moves focus in when it opens, and back to what opened it when it closes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open it" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Order BY-0007" });
    expect(dialog).toContainElement(document.activeElement);
    expect(document.activeElement).toHaveAccessibleName("Close");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("keeps Tab inside, wrapping at both ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open it" }));
    const dialog = screen.getByRole("dialog");
    // Close (focused), First field, Last button, then back round to Close, never to the page behind.
    await user.tab();
    expect(screen.getByLabelText("First field")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Last button" })).toHaveFocus();
    await user.tab();
    expect(document.activeElement).toHaveAccessibleName("Close");
    expect(dialog).toContainElement(document.activeElement);
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Last button" })).toHaveFocus();
  });

  it("pulls focus back in if it strays outside", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open it" }));
    screen.getByRole("button", { name: "Behind the sheet" }).focus();
    await user.tab();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement);
  });

  it("closes from the backdrop and the close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Open it" }));
    await user.click(screen.getAllByRole("button", { name: "Close" })[1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
