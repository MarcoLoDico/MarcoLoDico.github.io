import { describe, expect, it } from "vitest";
import { insideFootprint, type Obstacle } from "./terrain";

/** A 40 × 10 m building: long east–west, narrow north–south. */
const longBuilding: Obstacle = {
  lat: 43.65,
  lon: -79.38,
  radius: Math.hypot(20, 5),
  bottom: 70,
  top: 120,
  footprint: new Float32Array([-20, -5, 20, -5, 20, 5, -20, 5]),
};

describe("insideFootprint", () => {
  it("hits inside the walls", () => {
    expect(insideFootprint(longBuilding, 0, 0)).toBe(true);
    expect(insideFootprint(longBuilding, 18, 4)).toBe(true);
  });

  it("misses beside a long, narrow building even within its bounding circle", () => {
    expect(insideFootprint(longBuilding, 0, 12)).toBe(false);
    expect(insideFootprint(longBuilding, 0, -8)).toBe(false);
  });
});
