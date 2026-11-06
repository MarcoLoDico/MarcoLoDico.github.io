import { ShapeUtils, Vector2 } from "three";
import { LocalFrame, tileWidthMeters, tileXToLon, tileYToLat, toEcef, type Vec3 } from "../sim/geo";
import { GRID, type Exclusion } from "./tileProtocol";

/** Land-cover classes painted into a small raster per tile, then sampled per triangle. */
export const Cover = {
  Land: 0,
  Water: 1,
  Forest: 2,
  Grass: 3,
  Farmland: 4,
  Residential: 5,
  Commercial: 6,
  Sand: 7,
  Rock: 8,
  Ice: 9,
  Wetland: 10,
  Airfield: 11,
  Paved: 12,
} as const;
export type Cover = (typeof Cover)[keyof typeof Cover];

export const COVER_RASTER = 128;

export interface VectorPoint {
  readonly x: number;
  readonly y: number;
}

/** The subset of a decoded vector tile the builder needs, in tile extent units. */
export interface TileFeatures {
  readonly extent: number;
  readonly runways: readonly (readonly VectorPoint[])[];
  readonly taxiways: readonly (readonly VectorPoint[])[];
  readonly roads: readonly { readonly width: number; readonly color: number; readonly line: readonly VectorPoint[] }[];
  readonly buildings: readonly { readonly ring: readonly VectorPoint[]; readonly height: number; readonly minHeight: number }[];
}

export interface TileInputs {
  readonly z: number;
  readonly x: number;
  readonly y: number;
  /** 256×256 Terrarium-encoded RGBA elevation pixels. */
  readonly elevation: Uint8ClampedArray;
  /** COVER_RASTER² land-cover classes. */
  readonly cover: Uint8Array;
  readonly features: TileFeatures | null;
  readonly exclusions: readonly Exclusion[];
}

export interface TileGeometry {
  readonly positions: Float32Array;
  readonly normals: Int8Array;
  readonly colors: Uint8Array;
  readonly heights: Float32Array;
  readonly water: Uint8Array;
  readonly obstacles: Float32Array;
  /** Per-vertex facade coordinates for the building window shader. */
  readonly facades: Float32Array;
  /** Vertex indices where buildings, paving (runways, taxiways, roads), and markings start. */
  readonly buildingStart: number;
  readonly pavingStart: number;
  readonly runwayStart: number;
  readonly markingStart: number;
}

// sRGB palette; converted to linear bytes when written.
const COVER_COLORS: Record<Cover, number> = {
  [Cover.Land]: 0x9cbf73,
  [Cover.Water]: 0x4a9cc7,
  [Cover.Forest]: 0x4f8a4c,
  [Cover.Grass]: 0x8fc46c,
  [Cover.Farmland]: 0xc4c97f,
  [Cover.Residential]: 0xc9c3b2,
  [Cover.Commercial]: 0xb8b3a8,
  [Cover.Sand]: 0xe6d6a2,
  [Cover.Rock]: 0xa59f93,
  [Cover.Ice]: 0xf1f4f7,
  [Cover.Wetland]: 0x7ca889,
  [Cover.Airfield]: 0xa9c98a,
  [Cover.Paved]: 0x8e9196,
};

const RUNWAY_WIDTH = 45;
const TAXIWAY_WIDTH = 16;
const ASPHALT = 0x4b4e53;
const TAXIWAY = 0x5d6066;
const MARKING = 0xf2f2ee;

const BUILDING_WALLS = [0xd9d2c5, 0xcfc6b8, 0xe3ddd2, 0xbfb6a8, 0xc9b49b, 0xb8a48d, 0xd6cbbb, 0xc2b8ab];
const TOWER_WALLS = [0x9fb2c2, 0x8ea3b5, 0xb2c0cc, 0x7f95a8, 0xa7b4bd];
const HOUSE_WALLS = [0xe8e2d4, 0xd9cdb8, 0xc6a98b, 0xa7745f, 0xd3d6d0, 0xbfb2a0];
const HOUSE_ROOFS = [0x5f5651, 0x6b4e3f, 0x7a4a3a, 0x55585e, 0x7c7368];
const TREE_GREENS = [0x3f7a43, 0x4b8a46, 0x5a9a4c, 0x37703f, 0x66a052];

function srgbToLinearByte(channel: number): number {
  const c = channel / 255;
  const linear = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return Math.round(Math.min(1, Math.max(0, linear)) * 255);
}

/** Deterministic 0…1 noise from integers, so tiles look the same every visit. */
function hash(a: number, b: number, c = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Facade coordinates for a vertex: [metres along the wall (+10000 per style), metres up]. */
type Facade = readonly [number, number];
const NO_FACADE: Facade = [0, -1];

class Writer {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  /** Per-vertex facade coordinates, read by the building shader to draw windows. */
  facades: number[] = [];

  tri(a: Vec3, b: Vec3, c: Vec3, color: number, shade = 1, fa: Facade = NO_FACADE, fb: Facade = NO_FACADE, fc: Facade = NO_FACADE): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const r = srgbToLinearByte(((color >> 16) & 255) * shade);
    const g = srgbToLinearByte(((color >> 8) & 255) * shade);
    const bl = srgbToLinearByte((color & 255) * shade);
    this.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.facades.push(fa[0], fa[1], fb[0], fb[1], fc[0], fc[1]);
    for (let i = 0; i < 3; i++) {
      this.normals.push(Math.round(nx * 127), Math.round(ny * 127), Math.round(nz * 127));
      this.colors.push(r, g, bl);
    }
  }

  /** Adds a triangle wound so its normal points up (+y) or outward from `inside`. */
  triFacing(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    color: number,
    shade: number,
    inside: Vec3 | null,
    fa: Facade = NO_FACADE,
    fb: Facade = NO_FACADE,
    fc: Facade = NO_FACADE,
  ): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    let flip: boolean;
    if (inside) {
      const cx = (a[0] + b[0] + c[0]) / 3 - inside[0];
      const cy = (a[1] + b[1] + c[1]) / 3 - inside[1];
      const cz = (a[2] + b[2] + c[2]) / 3 - inside[2];
      flip = nx * cx + ny * cy + nz * cz < 0;
    } else {
      flip = ny < 0;
    }
    if (flip) {
      this.tri(b, a, c, color, shade, fb, fa, fc);
    } else {
      this.tri(a, b, c, color, shade, fa, fb, fc);
    }
  }

  get vertexCount(): number {
    return this.positions.length / 3;
  }
}

/** Clips a convex polygon to the left of the directed line a→b (Sutherland–Hodgman). */
function clipHalfPlane(points: readonly [number, number][], a: [number, number], b: [number, number]): [number, number][] {
  const side = (p: [number, number]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const out: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    if (!p || !q) {
      continue;
    }
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) {
      out.push(p);
    }
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

function pointInRing(points: readonly VectorPoint[], px: number, py: number): boolean {
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

/** Signed area (shoelace) of a polygon, in its own units squared. */
function polygonArea(points: readonly VectorPoint[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a && b) {
      area += a.x * b.y - b.x * a.y;
    }
  }
  return area / 2;
}

/** The smallest-area rectangle around a footprint, aligned to one of its edges. */
function orientedBox(points: readonly VectorPoint[]): { corners: VectorPoint[]; long: number; short: number } | null {
  let best: { corners: VectorPoint[]; long: number; short: number; area: number } | null = null;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) {
      continue;
    }
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) {
      continue;
    }
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of points) {
      const pu = p.x * ux + p.y * uy;
      const pv = -p.x * uy + p.y * ux;
      minU = Math.min(minU, pu);
      maxU = Math.max(maxU, pu);
      minV = Math.min(minV, pv);
      maxV = Math.max(maxV, pv);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      const at = (pu: number, pv: number): VectorPoint => ({ x: pu * ux - pv * uy, y: pu * uy + pv * ux });
      // Order the corners so the first edge runs along the longer side.
      const alongU = maxU - minU >= maxV - minV;
      const corners = alongU
        ? [at(minU, minV), at(maxU, minV), at(maxU, maxV), at(minU, maxV)]
        : [at(minU, minV), at(minU, maxV), at(maxU, maxV), at(maxU, minV)];
      best = { corners, long: Math.max(maxU - minU, maxV - minV), short: Math.min(maxU - minU, maxV - minV), area };
    }
  }
  return best;
}

/** Builds one terrain tile: ground, water, runways, roads, buildings, and trees. */
export function buildTile(input: TileInputs): TileGeometry {
  const { z, x, y, elevation, cover, features } = input;
  const frame = new LocalFrame(tileYToLat(y + 0.5, z), tileXToLon(x + 0.5, z));
  const n = GRID;
  const stride = n + 1;
  const widthMeters = tileWidthMeters({ z, x, y });
  const cellMeters = widthMeters / n;
  const extent = features?.extent ?? 4096;
  const metersPerUnit = widthMeters / extent;

  const sampleElevation = (u: number, v: number): number => {
    const px = Math.min(255, Math.max(0, u * 256 - 0.5));
    const py = Math.min(255, Math.max(0, v * 256 - 0.5));
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const x1 = Math.min(255, x0 + 1);
    const y1 = Math.min(255, y0 + 1);
    const fx = px - x0;
    const fy = py - y0;
    const at = (ix: number, iy: number) => {
      const i = (iy * 256 + ix) * 4;
      return (elevation[i] ?? 0) * 256 + (elevation[i + 1] ?? 0) + (elevation[i + 2] ?? 0) / 256 - 32768;
    };
    const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
    const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
    return top * (1 - fy) + bottom * fy;
  };

  const coverAt = (u: number, v: number): Cover => {
    const cx = Math.min(COVER_RASTER - 1, Math.max(0, Math.floor(u * COVER_RASTER)));
    const cy = Math.min(COVER_RASTER - 1, Math.max(0, Math.floor(v * COVER_RASTER)));
    return (cover[cy * COVER_RASTER + cx] ?? 0) as Cover;
  };

  // ---- Heights, with water flattened and runways levelled ----
  const heights = new Float32Array(stride * stride);
  const vertexWater = new Uint8Array(stride * stride);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const v = j / n;
      let h = sampleElevation(u, v);
      const water = coverAt(u, v) === Cover.Water || h < 0;
      if (water) {
        h = Math.max(h, 0);
      }
      heights[j * stride + i] = h;
      vertexWater[j * stride + i] = water ? 1 : 0;
    }
  }

  for (const line of features?.runways ?? []) {
    for (let s = 0; s + 1 < line.length; s++) {
      const a = line[s];
      const b = line[s + 1];
      if (!a || !b) {
        continue;
      }
      const ha = sampleElevation(a.x / extent, a.y / extent);
      const hb = sampleElevation(b.x / extent, b.y / extent);
      const reach = RUNWAY_WIDTH / 2 + cellMeters * 1.05;
      for (let j = 0; j <= n; j++) {
        for (let i = 0; i <= n; i++) {
          const px = (i / n) * extent;
          const py = (j / n) * extent;
          const { t, distance } = projectOnSegment(px, py, a, b);
          if (distance * metersPerUnit <= reach) {
            heights[j * stride + i] = ha + (hb - ha) * t;
            vertexWater[j * stride + i] = 0;
          }
        }
      }
    }
  }

  const groundAt = (u: number, v: number): number => {
    const gx = Math.min(n - 1e-6, Math.max(0, u * n));
    const gy = Math.min(n - 1e-6, Math.max(0, v * n));
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    const h00 = heights[j * stride + i] ?? 0;
    const h10 = heights[j * stride + i + 1] ?? 0;
    const h01 = heights[(j + 1) * stride + i] ?? 0;
    const h11 = heights[(j + 1) * stride + i + 1] ?? 0;
    return fx >= fy ? h00 + fx * (h10 - h00) + fy * (h11 - h10) : h00 + fy * (h01 - h00) + fx * (h11 - h01);
  };

  const ecef: Vec3 = [0, 0, 0];
  const place = (u: number, v: number, h: number): Vec3 => {
    const lat = tileYToLat(y + v, z);
    const lon = tileXToLon(x + u, z);
    return frame.fromEcef(toEcef(lat, lon, h, ecef), [0, 0, 0]);
  };

  const grid: Vec3[] = new Array<Vec3>(stride * stride);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      grid[j * stride + i] = place(i / n, j / n, heights[j * stride + i] ?? 0);
    }
  }

  const out = new Writer();
  // Paving and markings go in their own draw groups, which the renderer nudges
  // toward the camera in depth so they lie flush on the ground without flicker.
  // Layers stacked in depth: roads and taxiways, then runways, then markings,
  // so overlapping paving never flickers between colours.
  const paving = new Writer();
  const runwaysOut = new Writer();
  const markingsOut = new Writer();
  // Buildings have their own group too, for the window shader.
  const buildingsOut = new Writer();
  const water = new Uint8Array(n * n * 2);
  const triangleColor = (cls: Cover, normalY: number, h: number, seed: number): [number, number] => {
    let color = COVER_COLORS[cls];
    if (cls === Cover.Land || cls === Cover.Grass || cls === Cover.Farmland || cls === Cover.Forest) {
      if (h > 3200) {
        color = COVER_COLORS[Cover.Ice];
      } else if (normalY < 0.82 || h > 2200) {
        color = COVER_COLORS[Cover.Rock];
      } else if (h > 1400 && cls === Cover.Land) {
        color = 0xa9a27b;
      }
    }
    if (cls === Cover.Farmland) {
      // Patchwork fields: neighbouring cells pick different crops.
      color = [0xc4c97f, 0xb6c46f, 0xd3c98b, 0xa9bd6c][Math.floor(seed * 4)] ?? color;
    }
    const jitter = cls === Cover.Water ? 0.97 + seed * 0.05 : 0.93 + seed * 0.12;
    return [color, jitter];
  };

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const i00 = j * stride + i;
      const i10 = i00 + 1;
      const i01 = i00 + stride;
      const i11 = i01 + 1;
      // Same split as the physics height lookup: (00,10,11) and (00,11,01).
      for (const [a, b, c, half] of [
        [i00, i10, i11, 0],
        [i00, i11, i01, 1],
      ] as const) {
        const pa = grid[a];
        const pb = grid[b];
        const pc = grid[c];
        if (!pa || !pb || !pc) {
          continue;
        }
        const cu = (i + (half === 0 ? 2 / 3 : 1 / 3)) / n;
        const cv = (j + (half === 0 ? 1 / 3 : 2 / 3)) / n;
        let cls = coverAt(cu, cv);
        const allWater = (vertexWater[a] ?? 0) + (vertexWater[b] ?? 0) + (vertexWater[c] ?? 0) === 3;
        if (allWater) {
          cls = Cover.Water;
        } else if (cls === Cover.Water) {
          cls = (vertexWater[a] ?? 0) + (vertexWater[b] ?? 0) + (vertexWater[c] ?? 0) >= 2 ? Cover.Water : Cover.Sand;
        }
        water[(j * n + i) * 2 + half] = cls === Cover.Water ? 1 : 0;
        const ux = pb[0] - pa[0];
        const uy = pb[1] - pa[1];
        const uz = pb[2] - pa[2];
        const vx = pc[0] - pa[0];
        const vy = pc[1] - pa[1];
        const vz = pc[2] - pa[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const normalY = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
        const h = ((heights[a] ?? 0) + (heights[b] ?? 0) + (heights[c] ?? 0)) / 3;
        const [color, shade] = triangleColor(cls, normalY, h, hash(x * 64 + i, y * 64 + j, z * 2 + half));
        out.triFacing(pa, pb, pc, color, shade, null);
      }
    }
  }

  // ---- Skirts hide cracks between tiles of different detail ----
  const skirt = Math.max(15, cellMeters * 0.35);
  const edge = (indices: number[]) => {
    for (let k = 0; k + 1 < indices.length; k++) {
      const ia = indices[k] ?? 0;
      const ib = indices[k + 1] ?? 0;
      const pa = grid[ia];
      const pb = grid[ib];
      if (!pa || !pb) {
        continue;
      }
      const da = place(...uvOf(ia, stride, n), (heights[ia] ?? 0) - skirt);
      const db = place(...uvOf(ib, stride, n), (heights[ib] ?? 0) - skirt);
      const color = (vertexWater[ia] ?? 0) && (vertexWater[ib] ?? 0) ? COVER_COLORS[Cover.Water] : 0x8a8270;
      out.triFacing(pa, pb, db, color, 0.9, [0, -1e6, 0]);
      out.triFacing(pa, db, da, color, 0.9, [0, -1e6, 0]);
    }
  };
  const range = (count: number, f: (k: number) => number) => Array.from({ length: count }, (_, k) => f(k));
  edge(range(stride, (k) => k));
  edge(range(stride, (k) => n * stride + k));
  edge(range(stride, (k) => k * stride));
  edge(range(stride, (k) => k * stride + n));

  const obstacles: number[] = [];
  if (features) {
    const toUv = (p: VectorPoint): [number, number] => [p.x / extent, p.y / extent];
    const insideTile = (p: VectorPoint) => p.x >= 0 && p.y >= 0 && p.x <= extent && p.y <= extent;

    // ---- Runways and taxiways as ribbons on the levelled ground ----
    // Paving lies a centimetre above the ground the physics rolls on; the
    // depth nudge in the renderer keeps it from flickering at any distance.
    const paveLift = 0.01;
    /**
     * Lays a flat convex polygon (tile u/v coordinates) onto the ground by
     * cutting it along the terrain's own triangles: every piece then lies
     * exactly on the surface beneath it, so nothing pokes through.
     */
    const drape = (polygon: [number, number][], color: number, lift: number, target: Writer) => {
      let minU = Infinity;
      let maxU = -Infinity;
      let minV = Infinity;
      let maxV = -Infinity;
      for (const [u, v] of polygon) {
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
      }
      const i0 = Math.max(0, Math.floor(minU * n));
      const i1 = Math.min(n - 1, Math.floor(maxU * n));
      const j0 = Math.max(0, Math.floor(minV * n));
      const j1 = Math.min(n - 1, Math.floor(maxV * n));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const p00: [number, number] = [i / n, j / n];
          const p10: [number, number] = [(i + 1) / n, j / n];
          const p11: [number, number] = [(i + 1) / n, (j + 1) / n];
          const p01: [number, number] = [i / n, (j + 1) / n];
          // The same two triangles per cell as the terrain mesh, wound so "left" is inside.
          for (const tri of [
            [p00, p10, p11],
            [p00, p11, p01],
          ] as const) {
            let piece = polygon;
            for (let e = 0; e < 3 && piece.length >= 3; e++) {
              const ea = tri[e];
              const eb = tri[(e + 1) % 3];
              if (ea && eb) {
                piece = clipHalfPlane(piece, ea, eb);
              }
            }
            if (piece.length < 3) {
              continue;
            }
            const points = piece.map(([u, v]) => place(u, v, groundAt(u, v) + lift));
            const first = points[0];
            for (let k = 1; first && k + 1 < points.length; k++) {
              const b = points[k];
              const c = points[k + 1];
              if (b && c) {
                target.triFacing(first, b, c, color, 1, null);
              }
            }
          }
        }
      }
    };
    const ribbon = (line: readonly VectorPoint[], width: number, color: number, lift: number, target = paving) => {
      for (let s = 0; s + 1 < line.length; s++) {
        const a = line[s];
        const b = line[s + 1];
        if (!a || !b) {
          continue;
        }
        const lengthUnits = Math.hypot(b.x - a.x, b.y - a.y);
        if (lengthUnits * metersPerUnit < 0.5) {
          continue;
        }
        const ox = ((-(b.y - a.y) / lengthUnits) * width) / 2 / metersPerUnit;
        const oy = (((b.x - a.x) / lengthUnits) * width) / 2 / metersPerUnit;
        const corner = (p: VectorPoint, side: number): [number, number] => [(p.x + ox * side) / extent, (p.y + oy * side) / extent];
        drape([corner(a, -1), corner(b, -1), corner(b, 1), corner(a, 1)], color, lift, target);
      }
    };
    const markings = (line: readonly VectorPoint[]) => {
      const first = line[0];
      const last = line[line.length - 1];
      if (!first || !last) {
        return;
      }
      const lengthMeters = Math.hypot(last.x - first.x, last.y - first.y) * metersPerUnit;
      if (lengthMeters < 200) {
        return;
      }
      const dirX = (last.x - first.x) / (lengthMeters / metersPerUnit);
      const dirY = (last.y - first.y) / (lengthMeters / metersPerUnit);
      const along = (from: number, to: number, offset: number, width: number) => {
        const p = (d: number, side: number): VectorPoint => ({
          x: first.x + (dirX * d - dirY * (offset + (side * width) / 2)) / metersPerUnit,
          y: first.y + (dirY * d + dirX * (offset + (side * width) / 2)) / metersPerUnit,
        });
        ribbon([p(from, 0), p(to, 0)], width, MARKING, paveLift * 2, markingsOut);
      };
      // Centreline dashes.
      for (let d = 60; d + 30 < lengthMeters - 60; d += 60) {
        along(d, d + 30, 0, 0.9);
      }
      // Threshold "piano keys" at real runway ends (not where the tile clipped the line).
      const thresholds: [number, number][] = [];
      if (insideTile(first)) {
        thresholds.push([6, 36]);
      }
      if (insideTile(last)) {
        thresholds.push([lengthMeters - 36, lengthMeters - 6]);
      }
      for (const [from, to] of thresholds) {
        for (let k = -3; k <= 3; k++) {
          if (k !== 0) {
            along(from, to, k * 5.5, 1.8);
          }
        }
      }
    };
    for (const line of features.taxiways) {
      ribbon(line, TAXIWAY_WIDTH, TAXIWAY, paveLift);
    }
    for (const line of features.runways) {
      ribbon(line, RUNWAY_WIDTH, ASPHALT, paveLift, runwaysOut);
      markings(line);
    }

    // ---- Roads, draped over the ground ----
    for (const road of features.roads) {
      ribbon(road.line, road.width, road.color, paveLift);
    }

    // ---- Buildings ----
    // Facade styles for the window shader: 0 houses and low-rises, 1 glass
    // towers, 2 commercial blocks with a storefront at street level.
    const metersToUnits = 1 / metersPerUnit;
    // Coarse occupancy grid (about 12 m cells) so generated houses avoid real buildings.
    const OCC = 160;
    const occupied = new Uint8Array(OCC * OCC);
    const markOccupied = (ring: readonly VectorPoint[], marginUnits: number) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of ring) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      const c0 = Math.max(0, Math.floor(((minX - marginUnits) / extent) * OCC));
      const c1 = Math.min(OCC - 1, Math.floor(((maxX + marginUnits) / extent) * OCC));
      const r0 = Math.max(0, Math.floor(((minY - marginUnits) / extent) * OCC));
      const r1 = Math.min(OCC - 1, Math.floor(((maxY + marginUnits) / extent) * OCC));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          occupied[r * OCC + c] = 1;
        }
      }
    };
    const isOccupied = (px: number, py: number) => {
      const c = Math.floor((px / extent) * OCC);
      const r = Math.floor((py / extent) * OCC);
      return c < 0 || r < 0 || c >= OCC || r >= OCC || occupied[r * OCC + c] === 1;
    };

    /** Extrudes one building footprint with windows, a roof, and rooftop plant; false if skipped. */
    const emitBuilding = (ring: VectorPoint[], buildingHeight: number, minHeight: number, generated: boolean): boolean => {
      let cx = 0;
      let cy = 0;
      for (const p of ring) {
        cx += p.x;
        cy += p.y;
      }
      cx /= ring.length;
      cy /= ring.length;
      if (cx < 0 || cy < 0 || cx > extent || cy > extent) {
        return false; // owned by the neighbouring tile
      }
      const areaMeters = Math.abs(polygonArea(ring)) * metersPerUnit * metersPerUnit;
      const height = Math.max(3, buildingHeight);
      // Coarser tiles further out keep only the buildings that shape the skyline.
      if (z < 14 && height < 12 && areaMeters < 500) {
        return false;
      }
      const centerLat = tileYToLat(y + cy / extent, z);
      const centerLon = tileXToLon(x + cx / extent, z);
      if (input.exclusions.some((e) => roughDistance(e.lat, e.lon, centerLat, centerLon) < e.radius)) {
        return false;
      }
      let minGround = Infinity;
      let radius = 0;
      for (const p of ring) {
        const [u, v] = toUv(p);
        minGround = Math.min(minGround, groundAt(u, v));
        radius = Math.max(radius, Math.hypot(p.x - cx, p.y - cy) * metersPerUnit);
      }
      const [cu, cv] = toUv({ x: cx, y: cy });
      const base = groundAt(cu, cv);
      const top = base + height;
      const bottom = minHeight > 0 ? base + minHeight : minGround - 2;
      const seed = hash(Math.round(cx), Math.round(cy), z);
      const commercial = !generated && coverAt(cu, cv) === Cover.Commercial;
      const style = height > 40 ? 1 : commercial || (height >= 12 && areaMeters > 600) ? 2 : 0;
      const palette = style === 1 ? TOWER_WALLS : seed > 0.55 && style === 0 ? HOUSE_WALLS : BUILDING_WALLS;
      const wall = palette[Math.floor(seed * 97) % palette.length] ?? 0xd0c8ba;
      const flatRoof = style === 1 ? 0x6f7a84 : [0x8d8a85, 0x9b958c, 0x7d7b78, 0xa59a8a][Math.floor(seed * 4)] ?? 0x8d8a85;
      const roofPoints = ring.map((p) => {
        const [u, v] = toUv(p);
        return place(u, v, top);
      });
      const bottomPoints = ring.map((p) => {
        const [u, v] = toUv(p);
        return place(u, v, bottom);
      });

      // Walls, with facade coordinates running round the building and up it.
      // Each wall faces outward by the footprint's winding, not a centre
      // point, which can sit outside some walls of L- and U-shaped buildings.
      const winding = Math.sign(polygonArea(ring)) || 1;
      let along = 0;
      for (let k = 0; k < ring.length; k++) {
        const k2 = (k + 1) % ring.length;
        const pk = ring[k];
        const pk2 = ring[k2];
        const t0 = roofPoints[k];
        const t1 = roofPoints[k2];
        const b0 = bottomPoints[k];
        const b1 = bottomPoints[k2];
        if (!pk || !pk2 || !t0 || !t1 || !b0 || !b1) {
          continue;
        }
        const wallLength = Math.hypot(pk2.x - pk.x, pk2.y - pk.y) * metersPerUnit;
        const u0 = style * 10_000 + along;
        const u1 = u0 + wallLength;
        along += wallLength;
        const low = bottom - base;
        const ex = pk2.x - pk.x;
        const ey = pk2.y - pk.y;
        const len = Math.hypot(ex, ey) || 1;
        const inward: VectorPoint = {
          x: (pk.x + pk2.x) / 2 - ((winding * ey) / len) * metersToUnits,
          y: (pk.y + pk2.y) / 2 + ((winding * ex) / len) * metersToUnits,
        };
        const wallInside = place(inward.x / extent, inward.y / extent, (top + bottom) / 2);
        buildingsOut.triFacing(b0, b1, t1, wall, 1, wallInside, [u0, low], [u1, low], [u1, height]);
        buildingsOut.triFacing(b0, t1, t0, wall, 1, wallInside, [u0, low], [u1, height], [u0, height]);
      }

      const box = style === 0 && height <= 12 && areaMeters <= 320 && ring.length <= 14 ? orientedBox(ring) : null;
      if (box) {
        // A gabled roof over the house, ridge along its long side.
        const roofColor = HOUSE_ROOFS[Math.floor(seed * 89) % HOUSE_ROOFS.length] ?? 0x6b5a4e;
        const ridgeHeight = Math.min(4, box.short * metersPerUnit * 0.32);
        const overhang = 0.3 * metersToUnits;
        const centre = { x: cx, y: cy };
        const grow = (p: VectorPoint): VectorPoint => {
          const dx = p.x - centre.x;
          const dy = p.y - centre.y;
          const len = Math.hypot(dx, dy) || 1;
          return { x: p.x + (dx / len) * overhang, y: p.y + (dy / len) * overhang };
        };
        const [A, B, C, D] = box.corners.map(grow);
        if (A && B && C && D) {
          const at = (p: VectorPoint, h: number) => {
            const [u, v] = toUv(p);
            return place(u, v, h);
          };
          const mid = (p: VectorPoint, q: VectorPoint): VectorPoint => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
          const r1 = at(mid(A, D), top + ridgeHeight);
          const r2 = at(mid(B, C), top + ridgeHeight);
          const [a, b, c, d] = [at(A, top), at(B, top), at(C, top), at(D, top)];
          const roofInside = place(cu, cv, top - 1);
          buildingsOut.triFacing(a, b, r2, roofColor, 1, roofInside);
          buildingsOut.triFacing(a, r2, r1, roofColor, 1, roofInside);
          buildingsOut.triFacing(d, c, r2, roofColor, 0.88, roofInside);
          buildingsOut.triFacing(d, r2, r1, roofColor, 0.88, roofInside);
          buildingsOut.triFacing(a, r1, d, wall, 1, roofInside);
          buildingsOut.triFacing(b, r2, c, wall, 1, roofInside);
        }
      } else {
        const contour = ring.map((p) => new Vector2(p.x, p.y));
        for (const face of ShapeUtils.triangulateShape(contour, [])) {
          const pa = roofPoints[face[0] ?? 0];
          const pb = roofPoints[face[1] ?? 0];
          const pc = roofPoints[face[2] ?? 0];
          if (pa && pb && pc) {
            // Roofs face up; the tile's local y is up.
            buildingsOut.triFacing(pa, pb, pc, flatRoof, 1, null);
          }
        }
        // Mechanical rooms and plant on big flat roofs.
        // Only where the centre is on the roof: on L- and U-shaped buildings it may not be.
        if (height >= 15 && areaMeters >= 400 && pointInRing(ring, cx, cy)) {
          const size = Math.min(16, Math.sqrt(areaMeters) * 0.32) * metersToUnits;
          const unitHeight = 2.5 + seed * 2.5;
          rooftopBox(buildingsOut, (px, py, h) => place(px / extent, py / extent, h), cx, cy, size, top, top + unitHeight, 0x8a8a88);
          if (height > 80) {
            rooftopBox(buildingsOut, (px, py, h) => place(px / extent, py / extent, h), cx, cy, size * 0.55, top + unitHeight, top + unitHeight + 6, flatRoof);
          }
        }
      }

      if (!generated && height >= 8 && z >= 14) {
        // Record: vertex count, top altitude, centre, bounding radius, then the
        // footprint as metre offsets east/north of the centre (precise in float32).
        const metersPerDegLat = 111_320;
        const metersPerDegLon = 111_320 * Math.cos((centerLat * Math.PI) / 180);
        obstacles.push(ring.length, top, centerLat, centerLon, radius);
        for (const pt of ring) {
          const lat = tileYToLat(y + pt.y / extent, z);
          const lon = tileXToLon(x + pt.x / extent, z);
          obstacles.push((lon - centerLon) * metersPerDegLon, (lat - centerLat) * metersPerDegLat);
        }
      }
      return true;
    };

    for (const building of features.buildings) {
      const ring = simplifyRing(building.ring, 1.5 * metersToUnits);
      if (ring.length >= 3 && emitBuilding(ring, building.height, building.minHeight, false)) {
        markOccupied(ring, 3 * metersToUnits);
      }
    }

    // ---- Autogen: houses along residential streets ----
    // The free map data leaves out most houses, so neighbourhoods are filled
    // the way flight sims usually do it: lots along real streets, each with
    // a small house facing the road, seeded so they're the same every visit.
    if (z >= 14) {
      generateHouses(features.roads, emitBuilding, isOccupied, markOccupied, coverAt, extent, metersPerUnit, x, y);
    }

    // ---- Trees in woods, parks, and leafy streets (nearest tiles only) ----
    if (z >= 14) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          for (let k = 0; k < 4; k++) {
            const r1 = hash(x * 131 + i, y * 131 + j, k * 7 + 1);
            const u = (i + hash(x + i, y + j, k * 7 + 2)) / n;
            const v = (j + hash(x - i, y - j, k * 7 + 3)) / n;
            const cls = coverAt(u, v);
            const density = cls === Cover.Forest ? 0.85 : cls === Cover.Grass ? 0.07 : cls === Cover.Residential ? 0.18 : cls === Cover.Wetland ? 0.15 : 0;
            if (r1 >= density) {
              continue;
            }
            const ground = groundAt(u, v);
            const size = 0.75 + hash(i, j, k * 7 + 4) * 0.6;
            tree(out, place, u, v, ground, size, TREE_GREENS[Math.floor(r1 * 97) % TREE_GREENS.length] ?? 0x4b8a46);
          }
        }
      }
    }
  }

  const writers = [out, buildingsOut, paving, runwaysOut, markingsOut];
  return {
    positions: new Float32Array(writers.flatMap((w) => w.positions)),
    normals: new Int8Array(writers.flatMap((w) => w.normals)),
    colors: new Uint8Array(writers.flatMap((w) => w.colors)),
    facades: new Float32Array(writers.flatMap((w) => w.facades)),
    buildingStart: out.vertexCount,
    pavingStart: out.vertexCount + buildingsOut.vertexCount,
    runwayStart: out.vertexCount + buildingsOut.vertexCount + paving.vertexCount,
    markingStart: out.vertexCount + buildingsOut.vertexCount + paving.vertexCount + runwaysOut.vertexCount,
    heights,
    water,
    obstacles: new Float32Array(obstacles),
  };
}

/** A two-tier low-poly conifer, or a round deciduous tree. */
function tree(
  out: Writer,
  place: (u: number, v: number, h: number) => Vec3,
  u: number,
  v: number,
  ground: number,
  size: number,
  color: number,
): void {
  const base = place(u, v, ground - 1);
  const tiers: [number, number, number][] = [
    [2.5 * size, 4.2 * size, 11 * size],
    [8 * size, 3.0 * size, 16 * size],
  ];
  // Offsets are applied in the tile frame directly: trees are small enough
  // that the tile's local axes are the local horizontal.
  for (const [from, radius, to] of tiers) {
    const apex: Vec3 = [base[0], base[1] + to, base[2]];
    const ring: Vec3[] = [];
    for (let s = 0; s < 5; s++) {
      const t = (s / 5) * Math.PI * 2 + size;
      ring.push([base[0] + Math.cos(t) * radius, base[1] + from, base[2] + Math.sin(t) * radius]);
    }
    const inside: Vec3 = [base[0], base[1] + from + 0.5, base[2]];
    for (let s = 0; s < 5; s++) {
      const a = ring[s];
      const b = ring[(s + 1) % 5];
      if (a && b) {
        out.triFacing(a, b, apex, color, s % 2 === 0 ? 1 : 0.88, inside);
      }
    }
  }
}

interface RoadSegment {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly halfWidth: number;
}

/**
 * Places houses on lots lining residential streets: every few metres along
 * each street, on both sides, a house set back from the road and turned to
 * face it. Lots that would overlap the road, another street, a real building,
 * or a non-residential area are skipped.
 */
function generateHouses(
  roads: TileFeatures["roads"],
  emit: (ring: VectorPoint[], height: number, minHeight: number, generated: boolean) => boolean,
  isOccupied: (px: number, py: number) => boolean,
  markOccupied: (ring: readonly VectorPoint[], margin: number) => void,
  coverAt: (u: number, v: number) => Cover,
  extent: number,
  metersPerUnit: number,
  tileX: number,
  tileY: number,
): void {
  const toUnits = 1 / metersPerUnit;
  const segments: RoadSegment[] = [];
  for (const road of roads) {
    for (let k = 0; k + 1 < road.line.length; k++) {
      const a = road.line[k];
      const b = road.line[k + 1];
      if (a && b) {
        segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, halfWidth: (road.width / 2) * toUnits });
      }
    }
  }
  // Spatial hash of road segments so lot checks stay cheap.
  const BUCKET = 64;
  const buckets = new Map<number, RoadSegment[]>();
  const bucketKey = (bx: number, by: number) => by * 1024 + bx;
  for (const seg of segments) {
    const pad = seg.halfWidth + 40 * toUnits;
    const x0 = Math.floor((Math.min(seg.ax, seg.bx) - pad) / BUCKET);
    const x1 = Math.floor((Math.max(seg.ax, seg.bx) + pad) / BUCKET);
    const y0 = Math.floor((Math.min(seg.ay, seg.by) - pad) / BUCKET);
    const y1 = Math.floor((Math.max(seg.ay, seg.by) + pad) / BUCKET);
    for (let by = y0; by <= y1; by++) {
      for (let bx = x0; bx <= x1; bx++) {
        const key = bucketKey(bx + 64, by + 64);
        const list = buckets.get(key);
        if (list) {
          list.push(seg);
        } else {
          buckets.set(key, [seg]);
        }
      }
    }
  }
  const clearOfRoads = (px: number, py: number, clearance: number) => {
    const list = buckets.get(bucketKey(Math.floor(px / BUCKET) + 64, Math.floor(py / BUCKET) + 64)) ?? [];
    for (const seg of list) {
      const { distance } = projectOnSegment(px, py, { x: seg.ax, y: seg.ay }, { x: seg.bx, y: seg.by });
      if (distance < seg.halfWidth + clearance) {
        return false;
      }
    }
    return true;
  };

  const lotSpacing = 17 * toUnits;
  for (const [index, seg] of segments.entries()) {
    const dx = seg.bx - seg.ax;
    const dy = seg.by - seg.ay;
    const length = Math.hypot(dx, dy);
    if (length < lotSpacing) {
      continue;
    }
    const ux = dx / length;
    const uy = dy / length;
    for (const side of [-1, 1]) {
      // Normal pointing away from the road on this side.
      const nx = -uy * side;
      const ny = ux * side;
      for (let along = lotSpacing / 2; along < length - lotSpacing / 2; along += lotSpacing) {
        const seed = hash(Math.round(seg.ax + along * 7) + tileX * 4099, Math.round(seg.ay + side * 13) + tileY * 4099, index);
        if (seed < 0.12) {
          continue; // the odd empty lot
        }
        const width = (9 + seed * 4) * toUnits;
        const depth = (8 + hash(index, side, Math.round(along)) * 4) * toUnits;
        const setback = seg.halfWidth + (7 + seed * 4) * toUnits;
        const cx = seg.ax + ux * along + nx * (setback + depth / 2);
        const cy = seg.ay + uy * along + ny * (setback + depth / 2);
        if (cx < 0 || cy < 0 || cx > extent || cy > extent || isOccupied(cx, cy)) {
          continue;
        }
        if (coverAt(cx / extent, cy / extent) !== Cover.Residential) {
          continue;
        }
        const corner = (a: number, b: number): VectorPoint => ({
          x: cx + ux * (a * width) / 2 + nx * (b * depth) / 2,
          y: cy + uy * (a * width) / 2 + ny * (b * depth) / 2,
        });
        const ring = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
        if (!ring.every((p) => clearOfRoads(p.x, p.y, 2 * toUnits))) {
          continue;
        }
        const storeys = seed > 0.7 ? 2 : 1;
        if (emit(ring, storeys * 3 + 1.2 + seed, 0, true)) {
          markOccupied(ring, 4 * toUnits);
        }
      }
    }
  }
}

/** A flat-topped box on a roof: lift shaft, plant room, or tower crown. */
function rooftopBox(
  out: Writer,
  place: (px: number, py: number, h: number) => Vec3,
  cx: number,
  cy: number,
  half: number,
  bottom: number,
  top: number,
  color: number,
): void {
  const corners: [number, number][] = [
    [cx - half / 2, cy - half / 2],
    [cx + half / 2, cy - half / 2],
    [cx + half / 2, cy + half / 2],
    [cx - half / 2, cy + half / 2],
  ];
  const inside = place(cx, cy, (top + bottom) / 2);
  const low = corners.map(([px, py]) => place(px, py, bottom));
  const high = corners.map(([px, py]) => place(px, py, top));
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4;
    const [l0, l1, h0, h1] = [low[k], low[k2], high[k], high[k2]];
    if (l0 && l1 && h0 && h1) {
      out.triFacing(l0, l1, h1, color, 0.95, inside);
      out.triFacing(l0, h1, h0, color, 0.95, inside);
    }
  }
  const [a, b, c, d] = high;
  if (a && b && c && d) {
    out.triFacing(a, b, c, color, 0.85, inside);
    out.triFacing(a, c, d, color, 0.85, inside);
  }
}

function uvOf(index: number, stride: number, n: number): [number, number] {
  return [(index % stride) / n, Math.floor(index / stride) / n];
}

function projectOnSegment(px: number, py: number, a: VectorPoint, b: VectorPoint): { t: number; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lengthSq));
  return { t, distance: Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t)) };
}

/** Drops vertices closer than `tolerance` and nearly collinear ones: low-poly footprints. */
function simplifyRing(ring: readonly VectorPoint[], tolerance: number): VectorPoint[] {
  const points = ring.slice();
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && first.x === last.x && first.y === last.y) {
    points.pop();
  }
  const kept: VectorPoint[] = [];
  for (const p of points) {
    const prev = kept[kept.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= tolerance) {
      kept.push(p);
    }
  }
  let changed = true;
  while (changed && kept.length > 3) {
    changed = false;
    for (let i = 0; i < kept.length; i++) {
      const a = kept[(i + kept.length - 1) % kept.length];
      const b = kept[i];
      const c = kept[(i + 1) % kept.length];
      if (!a || !b || !c) {
        continue;
      }
      const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
      const base = Math.hypot(c.x - a.x, c.y - a.y);
      if (area / (base || 1) < tolerance * 0.35) {
        kept.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return kept;
}

function roughDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dy = (lat2 - lat1) * 111_320;
  const dx = (lon2 - lon1) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}
