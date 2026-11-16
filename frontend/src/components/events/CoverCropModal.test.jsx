import { describe, expect, it } from "vitest";
import { defaultMode, fitLayout } from "./CoverCropModal";

describe("cover framing", () => {
  it("shows tall and square images whole, and fills the frame with wide ones", () => {
    expect(defaultMode(1024, 1280)).toBe("fit");
    expect(defaultMode(1000, 1000)).toBe("fit");
    expect(defaultMode(1600, 900)).toBe("fill");
    expect(defaultMode(3000, 1500)).toBe("fill");
  });

  it("keeps a 1024 x 1280 image whole, centred in a 16:9 frame", () => {
    const l = fitLayout(1024, 1280);
    expect([l.frameW, l.frameH]).toEqual([1600, 900]);
    expect([l.dw, l.dh]).toEqual([720, 900]);
    expect([l.dx, l.dy]).toEqual([440, 0]);
  });

  it("never enlarges a small image past its own size", () => {
    const l = fitLayout(400, 500);
    expect([l.dw, l.dh]).toEqual([400, 500]);
    expect(l.frameH).toBe(500);
    expect(l.frameW).toBe(Math.round((500 * 1600) / 900));
    expect(l.dx).toBeGreaterThan(0);
  });

  it("fits a very wide image across the frame without cutting it", () => {
    const l = fitLayout(4000, 1000);
    expect(l.dw).toBeLessThanOrEqual(l.frameW);
    expect(l.dh).toBeLessThanOrEqual(l.frameH);
    expect(l.dw / l.dh).toBeCloseTo(4, 1);
  });
});
