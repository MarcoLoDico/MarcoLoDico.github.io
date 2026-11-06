/**
 * Geometry on a spherical Earth. A sphere is within ~0.3% of the real ellipsoid,
 * which is invisible at low-poly detail and keeps every conversion exact and cheap.
 *
 * Scene space is a local tangent plane: +x east, +y up, -z north (three.js's
 * y-up convention), anchored at an origin on the surface.
 */

export const EARTH_RADIUS = 6_371_008.8;
const DEG = Math.PI / 180;

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

export interface Geodetic extends LatLon {
  readonly alt: number;
}

export type Vec3 = [number, number, number];

export function toEcef(lat: number, lon: number, alt: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const r = EARTH_RADIUS + alt;
  const cosLat = Math.cos(lat * DEG);
  out[0] = r * cosLat * Math.cos(lon * DEG);
  out[1] = r * cosLat * Math.sin(lon * DEG);
  out[2] = r * Math.sin(lat * DEG);
  return out;
}

export function fromEcef(x: number, y: number, z: number): Geodetic {
  const r = Math.hypot(x, y, z);
  return { lat: Math.asin(z / r) / DEG, lon: Math.atan2(y, x) / DEG, alt: r - EARTH_RADIUS };
}

/** East, north, and up unit vectors in Earth-centred coordinates at a point. */
export interface TangentBasis {
  readonly east: Vec3;
  readonly north: Vec3;
  readonly up: Vec3;
}

export function tangentBasis(lat: number, lon: number): TangentBasis {
  const sinLat = Math.sin(lat * DEG);
  const cosLat = Math.cos(lat * DEG);
  const sinLon = Math.sin(lon * DEG);
  const cosLon = Math.cos(lon * DEG);
  return {
    east: [-sinLon, cosLon, 0],
    north: [-sinLat * cosLon, -sinLat * sinLon, cosLat],
    up: [cosLat * cosLon, cosLat * sinLon, sinLat],
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * A local scene frame pinned to a point on the surface. Everything rendered or
 * simulated lives in one of these; the simulation re-anchors it under the
 * aircraft as it travels so 32-bit floats stay precise.
 */
export class LocalFrame {
  readonly lat: number;
  readonly lon: number;
  readonly center: Vec3;
  readonly basis: TangentBasis;

  constructor(lat: number, lon: number) {
    this.lat = lat;
    this.lon = lon;
    this.center = toEcef(lat, lon, 0);
    this.basis = tangentBasis(lat, lon);
  }

  /** Earth-centred point → scene coordinates. */
  fromEcef(p: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
    const d: Vec3 = [p[0] - this.center[0], p[1] - this.center[1], p[2] - this.center[2]];
    out[0] = dot(d, this.basis.east);
    out[1] = dot(d, this.basis.up);
    out[2] = -dot(d, this.basis.north);
    return out;
  }

  /** Earth-centred direction → scene direction. */
  directionFromEcef(v: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
    out[0] = dot(v, this.basis.east);
    out[1] = dot(v, this.basis.up);
    out[2] = -dot(v, this.basis.north);
    return out;
  }

  /** Scene coordinates → Earth-centred point. */
  toEcef(x: number, y: number, z: number, out: Vec3 = [0, 0, 0]): Vec3 {
    const { east, north, up } = this.basis;
    out[0] = this.center[0] + x * east[0] + y * up[0] - z * north[0];
    out[1] = this.center[1] + x * east[1] + y * up[1] - z * north[1];
    out[2] = this.center[2] + x * east[2] + y * up[2] - z * north[2];
    return out;
  }

  /** Scene direction → Earth-centred direction. */
  directionToEcef(x: number, y: number, z: number, out: Vec3 = [0, 0, 0]): Vec3 {
    const { east, north, up } = this.basis;
    out[0] = x * east[0] + y * up[0] - z * north[0];
    out[1] = x * east[1] + y * up[1] - z * north[1];
    out[2] = x * east[2] + y * up[2] - z * north[2];
    return out;
  }

  toGeodetic(x: number, y: number, z: number): Geodetic {
    const p = this.toEcef(x, y, z);
    return fromEcef(p[0], p[1], p[2]);
  }

  fromGeodetic(lat: number, lon: number, alt: number, out: Vec3 = [0, 0, 0]): Vec3 {
    return this.fromEcef(toEcef(lat, lon, alt), out);
  }

  /**
   * Column-major 4×4 matrix that places geometry authored in `other`'s scene
   * space into this frame's scene space. Computed in float64, so tiles and
   * landmarks thousands of kilometres apart still line up exactly.
   */
  matrixFrom(other: LocalFrame): number[] {
    const ex = this.directionFromEcef(other.basis.east);
    const up = this.directionFromEcef(other.basis.up);
    const north = this.directionFromEcef(other.basis.north);
    const t = this.fromEcef(other.center);
    return [ex[0], ex[1], ex[2], 0, up[0], up[1], up[2], 0, -north[0], -north[1], -north[2], 0, t[0], t[1], t[2], 1];
  }
}

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Moves a point a distance along a true bearing (degrees clockwise from north). */
export function offsetLatLon(origin: LatLon, bearingDeg: number, meters: number): LatLon {
  const d = meters / EARTH_RADIUS;
  const brg = bearingDeg * DEG;
  const lat1 = origin.lat * DEG;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
  const lon2 =
    origin.lon * DEG + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 / DEG, lon: lon2 / DEG };
}

// ---- Web Mercator tiles ----

export interface TileId {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

export function tileKey({ z, x, y }: TileId): string {
  return `${z}/${x}/${y}`;
}

/** Fractional tile coordinates of a point. */
export function lonLatToTileXY(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.asinh(Math.tan(clampedLat * DEG)) / Math.PI) / 2) * n;
  return [x, y];
}

export function tileXToLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

export function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return Math.atan(Math.sinh(n)) / DEG;
}

/** East–west width of a tile in metres at its centre latitude. */
export function tileWidthMeters({ z, y }: TileId): number {
  const lat = tileYToLat(y + 0.5, z);
  return ((2 * Math.PI * EARTH_RADIUS) / 2 ** z) * Math.cos(lat * DEG);
}
