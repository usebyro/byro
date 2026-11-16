import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// Next's image and link need a running app; plain elements are enough to test what a page shows.
vi.mock("next/image", () => ({
  default: ({ priority, fill, ...props }) => <img {...props} />, // eslint-disable-line @next/next/no-img-element, jsx-a11y/alt-text
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// jsdom has no matchMedia or clipboard.
window.matchMedia ||= (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue() }, configurable: true });
