import { BufferGeometry, Color, Float32BufferAttribute } from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type V3 = readonly [number, number, number];

const scratch = new Color();

/**
 * Accumulates flat-coloured triangles for the low-poly look: every face gets
 * its own vertices, so `computeVertexNormals` yields one normal per face.
 * Faces can be given a point inside the solid, and are flipped to face away
 * from it, which keeps lofted shapes correct without hand-ordering vertices.
 */
export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];

  tri(a: V3, b: V3, c: V3, color: number, inside?: V3): this {
    scratch.setHex(color);
    let p = a;
    let q = b;
    if (inside) {
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const uz = b[2] - a[2];
      const vx = c[0] - a[0];
      const vy = c[1] - a[1];
      const vz = c[2] - a[2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const cx = (a[0] + b[0] + c[0]) / 3 - inside[0];
      const cy = (a[1] + b[1] + c[1]) / 3 - inside[1];
      const cz = (a[2] + b[2] + c[2]) / 3 - inside[2];
      if (nx * cx + ny * cy + nz * cz < 0) {
        p = b;
        q = a;
      }
    }
    this.positions.push(p[0], p[1], p[2], q[0], q[1], q[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) {
      this.colors.push(scratch.r, scratch.g, scratch.b);
    }
    return this;
  }

  quad(a: V3, b: V3, c: V3, d: V3, color: number, inside?: V3): this {
    return this.tri(a, b, c, color, inside).tri(a, c, d, color, inside);
  }

  /** Closes a ring of points with a fan from its centroid. */
  cap(ring: readonly V3[], color: number, inside: V3): this {
    const center = centroid(ring);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (a && b) {
        this.tri(center, a, b, color, inside);
      }
    }
    return this;
  }

  /**
   * Skins consecutive rings (each with the same number of points) into a
   * closed tube. `color(ring, segment)` paints the face between ring and ring+1.
   */
  loft(rings: readonly (readonly V3[])[], color: (ring: number, segment: number) => number, caps = true): this {
    for (let r = 0; r + 1 < rings.length; r++) {
      const a = rings[r];
      const b = rings[r + 1];
      if (!a || !b) {
        continue;
      }
      const inside = midpoint(centroid(a), centroid(b));
      for (let i = 0; i < a.length; i++) {
        const j = (i + 1) % a.length;
        const a0 = a[i];
        const a1 = a[j];
        const b0 = b[i];
        const b1 = b[j];
        if (a0 && a1 && b0 && b1) {
          this.quad(a0, a1, b1, b0, color(r, i), inside);
        }
      }
    }
    const first = rings[0];
    const second = rings[1];
    const last = rings[rings.length - 1];
    const beforeLast = rings[rings.length - 2];
    if (caps && first && second && last && beforeLast) {
      this.cap(first, color(-1, 0), centroid(second));
      this.cap(last, color(rings.length - 1, 0), centroid(beforeLast));
    }
    return this;
  }

  /** A closed prism between two points, for struts, legs, and masts. */
  beam(from: V3, to: V3, radius: number, sides: number, color: number, radiusTo = radius): this {
    const dir: V3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    const d: V3 = [dir[0] / len, dir[1] / len, dir[2] / len];
    const helper: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = normalize(cross(d, helper));
    const v = cross(d, u);
    const ring = (center: V3, r: number) =>
      Array.from({ length: sides }, (_, i): V3 => {
        const t = (i / sides) * Math.PI * 2 + Math.PI / sides;
        const cu = Math.cos(t) * r;
        const sv = Math.sin(t) * r;
        return [center[0] + u[0] * cu + v[0] * sv, center[1] + u[1] * cu + v[1] * sv, center[2] + u[2] * cu + v[2] * sv];
      });
    return this.loft([ring(from, radius), ring(to, radiusTo)], () => color);
  }

  /** An axis-aligned box. */
  box(center: V3, size: V3, color: number, topColor = color): this {
    const [cx, cy, cz] = center;
    const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
    const p = (x: number, y: number, z: number): V3 => [cx + x * hx, cy + y * hy, cz + z * hz];
    const bottom = [p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1)];
    const top = [p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1)];
    return this.loft([bottom, top], (ring) => (ring === 1 ? topColor : color));
  }

  get isEmpty(): boolean {
    return this.positions.length === 0;
  }

  /**
   * Faces meeting at less than `creaseDegrees` are shaded smoothly; sharper
   * edges stay crisp. Without it every face is flat-shaded.
   */
  build(creaseDegrees?: number): BufferGeometry {
    let geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(this.colors, 3));
    if (creaseDegrees === undefined) {
      geometry.computeVertexNormals();
    } else {
      geometry = toCreasedNormals(geometry, (creaseDegrees * Math.PI) / 180);
    }
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export function centroid(points: readonly V3[]): V3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = Math.max(1, points.length);
  return [x / n, y / n, z / n];
}

function midpoint(a: V3, b: V3): V3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** A ring of points around a vertical axis, for lathe-style towers and pods. */
export function circle(cx: number, y: number, cz: number, radius: number, sides: number, phase = 0): V3[] {
  return Array.from({ length: sides }, (_, i): V3 => {
    const t = (i / sides) * Math.PI * 2 + phase;
    return [cx + Math.cos(t) * radius, y, cz + Math.sin(t) * radius];
  });
}
