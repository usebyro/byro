import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safeRedirect";

describe("safeRedirect", () => {
  it("keeps normal same-site paths, with their query and hash", () => {
    expect(safeRedirect("/home")).toBe("/home");
    expect(safeRedirect("/discover/abc123?ref=share#tickets")).toBe("/discover/abc123?ref=share#tickets");
    expect(safeRedirect("/dashboard/merch?tab=orders&order=BY-K7M4QX")).toBe("/dashboard/merch?tab=orders&order=BY-K7M4QX");
  });

  it.each([
    ["//evil.com"],
    ["/\\evil.com"],
    ["/\\\\evil.com"],
    ["/\\/evil.com"],
    ["/\t/evil.com"],
    ["/\n/evil.com"],
    ["/\r/evil.com"],
    ["/ /evil.com", ],
    ["https://evil.com"],
    ["http://evil.com/home"],
    ["javascript:alert(1)"],
    ["data:text/html,hi"],
    ["evil.com"],
    ["home"],
    [""],
    ["/%00"],
  ])("refuses %j", (value) => {
    const out = safeRedirect(value);
    // Either refused, or (for a harmless-looking path) it must stay on this site.
    if (out !== null) expect(out.startsWith("/") && !out.startsWith("//") && !out.includes("\\")).toBe(true);
    expect(["//evil.com", "/\\evil.com", "/\\\\evil.com", "/\\/evil.com", "https://evil.com", "http://evil.com/home", "javascript:alert(1)", "data:text/html,hi", "evil.com", "home", ""]).not.toContain(out);
  });

  it("refuses the backslash and control-character tricks outright", () => {
    for (const v of ["/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\\\\evil.com", "//evil.com"]) {
      expect(safeRedirect(v)).toBeNull();
    }
  });

  it("refuses things that are not strings", () => {
    for (const v of [null, undefined, 42, {}, ["/home"]]) expect(safeRedirect(v)).toBeNull();
  });

  it("refuses absurdly long values", () => {
    expect(safeRedirect("/" + "a".repeat(2500))).toBeNull();
  });
});
