import { describe, expect, it } from "vitest";
import { distanceMeters, LocalFrame, lonLatToTileXY, offsetLatLon, tileXToLon, tileYToLat } from "./geo";

describe("LocalFrame", () => {
  it("round-trips geodetic points through scene coordinates", () => {
    const frame = new LocalFrame(43.6426, -79.3871);
    const [x, y, z] = frame.fromGeodetic(43.65, -79.4, 553);
    const back = frame.toGeodetic(x, y, z);
    expect(back.lat).toBeCloseTo(43.65, 9);
    expect(back.lon).toBeCloseTo(-79.4, 9);
    expect(back.alt).toBeCloseTo(553, 4);
  });

  it("puts north at -z and east at +x", () => {
    const frame = new LocalFrame(37.8, -122.4);
    const north = frame.fromGeodetic(37.81, -122.4, 0);
    const east = frame.fromGeodetic(37.8, -122.39, 0);
    expect(north[2]).toBeLessThan(-1000);
    expect(Math.abs(north[0])).toBeLessThan(1e-6);
    expect(east[0]).toBeGreaterThan(800);
  });

  it("places geometry from another frame exactly where it belongs", () => {
    const scene = new LocalFrame(43.47, -80.54);
    const tile = new LocalFrame(43.5, -80.5);
    const point = tile.fromGeodetic(43.51, -80.49, 330);
    const m = scene.matrixFrom(tile);
    const x = (m[0] ?? 0) * point[0] + (m[4] ?? 0) * point[1] + (m[8] ?? 0) * point[2] + (m[12] ?? 0);
    const y = (m[1] ?? 0) * point[0] + (m[5] ?? 0) * point[1] + (m[9] ?? 0) * point[2] + (m[13] ?? 0);
    const z = (m[2] ?? 0) * point[0] + (m[6] ?? 0) * point[1] + (m[10] ?? 0) * point[2] + (m[14] ?? 0);
    const expected = scene.fromGeodetic(43.51, -80.49, 330);
    expect(x).toBeCloseTo(expected[0], 3);
    expect(y).toBeCloseTo(expected[1], 3);
    expect(z).toBeCloseTo(expected[2], 3);
  });
});

describe("tiles and distances", () => {
  it("inverts tile coordinates", () => {
    const [x, y] = lonLatToTileXY(-79.3871, 43.6426, 14);
    expect(tileXToLon(x, 14)).toBeCloseTo(-79.3871, 9);
    expect(tileYToLat(y, 14)).toBeCloseTo(43.6426, 9);
  });

  it("measures Toronto to San Francisco at about 3,640 km", () => {
    const km = distanceMeters({ lat: 43.6532, lon: -79.3832 }, { lat: 37.7749, lon: -122.4194 }) / 1000;
    expect(km).toBeGreaterThan(3600);
    expect(km).toBeLessThan(3680);
  });

  it("moves a point along a bearing", () => {
    const start = { lat: 43.63, lon: -79.39 };
    const moved = offsetLatLon(start, 90, 1000);
    expect(distanceMeters(start, moved)).toBeCloseTo(1000, 3);
    expect(moved.lat).toBeCloseTo(start.lat, 3);
    expect(moved.lon).toBeGreaterThan(start.lon);
  });
});
