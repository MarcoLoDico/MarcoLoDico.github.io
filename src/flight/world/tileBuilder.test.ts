import { describe, expect, it } from "vitest";
import { tileWidthMeters } from "../sim/geo";
import { buildTile, COVER_RASTER, type VectorPoint } from "./tileBuilder";

const z = 14;
const x = 4578;
const y = 5980;
const extent = 4096;

/** An L-shaped footprint: its centroid lies outside one of its walls' reach. */
const L: VectorPoint[] = [
  { x: 2000, y: 2000 },
  { x: 2100, y: 2000 },
  { x: 2100, y: 2030 },
  { x: 2030, y: 2030 },
  { x: 2030, y: 2100 },
  { x: 2000, y: 2100 },
];

function insidePolygon(points: readonly VectorPoint[], px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a && b && a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

describe("building walls", () => {
  it("all face outward on a concave footprint", () => {
    // Flat ground at sea level in Terrarium encoding (32768 = 0 m).
    const elevation = new Uint8ClampedArray(256 * 256 * 4);
    for (let i = 0; i < elevation.length; i += 4) {
      elevation[i] = 128;
    }
    const built = buildTile({
      z,
      x,
      y,
      elevation,
      cover: new Uint8Array(COVER_RASTER * COVER_RASTER),
      features: { extent, runways: [], taxiways: [], roads: [], buildings: [{ ring: L, height: 20, minHeight: 0 }] },
      exclusions: [],
    });
    const width = tileWidthMeters({ z, x, y });
    const unitsPerMeter = extent / width;
    let walls = 0;
    let bad = 0;
    for (let v = built.buildingStart; v < built.pavingStart; v += 3) {
      const nx = (built.normals[v * 3] ?? 0) / 127;
      const ny = (built.normals[v * 3 + 1] ?? 0) / 127;
      const nz = (built.normals[v * 3 + 2] ?? 0) / 127;
      if (Math.abs(ny) > 0.5) {
        continue; // roofs
      }
      walls++;
      // Triangle centre in tile-local metres (x east, z south), nudged along its normal.
      let cx = 0;
      let cz = 0;
      for (let k = 0; k < 3; k++) {
        cx += (built.positions[(v + k) * 3] ?? 0) / 3;
        cz += (built.positions[(v + k) * 3 + 2] ?? 0) / 3;
      }
      const px = extent / 2 + (cx + nx * 2) * unitsPerMeter;
      const py = extent / 2 + (cz + nz * 2) * unitsPerMeter;
      if (insidePolygon(L, px, py)) {
        bad++;
      }
    }
    expect(bad).toBe(0);
    expect(walls).toBe(12);
  });
});
