import { describe, expect, it } from "vitest";
import { photo } from "./photos";

describe("photo", () => {
  it("resolves a photo to responsive WebP and JPEG sources", () => {
    const picture = photo("taormina-teatro-antico.jpg");

    expect(Object.keys(picture.sources).sort()).toEqual(["jpeg", "webp"]);
    expect(picture.img.w).toBeGreaterThan(0);
    expect(picture.img.h).toBeGreaterThan(0);
  });

  it("fails loudly for a photo that does not exist", () => {
    expect(() => photo("missing.jpg")).toThrow(/missing\.jpg/);
  });
});
