import { describe, expect, it } from "vitest";
import { MIN_THUMB_PIXELS, thumbGeometry } from "./scrollThumb";

describe("thumbGeometry", () => {
  it("returns null when the content fits", () => {
    expect(thumbGeometry({ scrollTop: 0, scrollHeight: 400, clientHeight: 400 }, 380)).toBeNull();
  });

  it("sizes the thumb by the visible fraction and places it by scroll progress", () => {
    const geometry = thumbGeometry({ scrollTop: 300, scrollHeight: 1000, clientHeight: 400 }, 200);
    expect(geometry).toEqual({ size: 80, offset: 60, scrollPerThumbPixel: 5 });
  });

  it("keeps very long content's thumb grabbable", () => {
    const geometry = thumbGeometry({ scrollTop: 0, scrollHeight: 100_000, clientHeight: 400 }, 200);
    expect(geometry?.size).toBe(MIN_THUMB_PIXELS);
  });

  it("stays on the track during overscroll bounces", () => {
    const metrics = { scrollHeight: 1000, clientHeight: 400 };
    expect(thumbGeometry({ ...metrics, scrollTop: -40 }, 200)?.offset).toBe(0);
    expect(thumbGeometry({ ...metrics, scrollTop: 700 }, 200)?.offset).toBe(120);
  });
});
