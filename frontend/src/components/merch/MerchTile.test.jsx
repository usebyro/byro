import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MerchTile from "./MerchTile";

const item = (over = {}) => ({
  id: 7, name: "Community tee", price: "12000.00", stock: 5,
  photos: [{ id: 1, url: "/a.jpg" }, { id: 2, url: "/b.jpg" }, { id: 3, url: "/c.jpg" }], ...over,
});

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn(); // jsdom has no scrollTo on elements
});

const show = (it, onOpen = vi.fn()) => {
  render(<ul><MerchTile item={it} onOpen={onOpen} /></ul>);
  return { onOpen, user: userEvent.setup() };
};

describe("merch tile", () => {
  it("a card with one photo is one button, so anywhere on it opens the preview", async () => {
    const { user, onOpen } = show(item({ photos: [{ id: 1, url: "/a.jpg" }] }));
    await user.click(screen.getByRole("img", { name: "Community tee" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it("a card with no photo opens too", async () => {
    const { user, onOpen } = show(item({ photos: [] }));
    await user.click(screen.getByRole("button", { name: /Community tee/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("a card with several photos opens from the photo, the name, the price or the space around them", async () => {
    const { user, onOpen } = show(item());
    await user.click(screen.getAllByRole("img")[0]);
    await user.click(screen.getByText("Community tee"));
    await user.click(screen.getByText("₦12,000"));
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it("the slideshow arrows change the photo and do not open the preview", async () => {
    const { user, onOpen } = show(item());
    await user.click(screen.getByRole("button", { name: "Next photo" }));
    await user.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(Element.prototype.scrollTo).toHaveBeenCalledTimes(2);
  });

  it("keyboard users open it from the name and price button, once", async () => {
    const { user, onOpen } = show(item());
    const button = screen.getByRole("button", { name: /Community tee, ₦12,000/ });
    button.focus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("says when it is low or sold out", () => {
    show(item({ stock: 0 }));
    expect(screen.getByRole("button", { name: /Sold out/ })).toBeInTheDocument();
  });
});
