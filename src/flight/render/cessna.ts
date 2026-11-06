import {
  CanvasTexture,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";
import { MeshBuilder, type V3 } from "./meshBuilder";

/**
 * A Cessna 172S modelled from its published dimensions: 11.0 m span, 8.28 m
 * long, high wing with 1.73° dihedral, NACA 2412 section with washout and a
 * tapered outer panel, swept fin, spring-steel main gear with wheel fairings,
 * and a two-blade fixed-pitch prop. Smooth-shaded where the real aircraft is
 * curved, crisp where it has edges.
 *
 * Body axes: +x right, +y up, -z forward; origin at the centre of gravity,
 * with the tyres touching the ground at y = -1.23.
 */

const WHITE = 0xf4f3ef;
const BELLY = 0xe4e3de;
const NAVY = 0x1b3a6b;
const GOLD = 0xc8973a;
const GLASS = 0x1b2630;
const COWL_DARK = 0x2a2c30;
const STEEL = 0xa7abb0;
const CHROME = 0xd4d7da;
const TIRE = 0x1c1d1f;
const HUB = 0xb9bcc0;
const BLADE = 0x2b2c2f;
const SEAM = 0x8c8d91;

const DEG = Math.PI / 180;
const CREASE = 38;

// ---------------------------------------------------------------------------
// Fuselage
// ---------------------------------------------------------------------------

interface Station {
  readonly z: number;
  readonly top: number;
  readonly bottom: number;
  /** Half widths at the roof shoulder and at the floor. */
  readonly widthTop: number;
  readonly widthBottom: number;
  readonly radiusTop: number;
  readonly radiusBottom: number;
}

const st = (z: number, top: number, bottom: number, widthTop: number, widthBottom: number, radiusTop: number, radiusBottom: number): Station => ({
  z,
  top,
  bottom,
  widthTop,
  widthBottom,
  radiusTop,
  radiusBottom,
});

const STATIONS: readonly Station[] = [
  st(-2.14, 0.3, -0.24, 0.27, 0.28, 0.2, 0.18), // 0 cowl lip
  st(-2.06, 0.37, -0.32, 0.38, 0.38, 0.21, 0.18), // 1
  st(-1.86, 0.43, -0.42, 0.47, 0.47, 0.19, 0.16), // 2
  st(-1.55, 0.46, -0.47, 0.52, 0.52, 0.16, 0.14), // 3
  st(-1.3, 0.48, -0.5, 0.54, 0.54, 0.15, 0.13), // 4 firewall, windshield base
  st(-0.88, 0.8, -0.52, 0.52, 0.55, 0.16, 0.12), // 5 mid windshield
  st(-0.47, 1.03, -0.53, 0.5, 0.55, 0.15, 0.11), // 6 windshield top, A-pillar front
  st(-0.43, 1.035, -0.53, 0.5, 0.55, 0.15, 0.11), // 7 A-pillar rear, door window front
  st(0.33, 1.05, -0.53, 0.5, 0.55, 0.15, 0.11), // 8 B-pillar front
  st(0.5, 1.05, -0.52, 0.5, 0.55, 0.15, 0.11), // 9 B-pillar rear
  st(1.07, 1.04, -0.48, 0.47, 0.52, 0.15, 0.11), // 10 roof end
  st(2.15, 0.66, -0.33, 0.36, 0.38, 0.13, 0.1), // 11 rear window bottom
  st(3.35, 0.52, -0.17, 0.23, 0.24, 0.11, 0.09), // 12
  st(4.55, 0.42, -0.04, 0.14, 0.14, 0.08, 0.07), // 13
  st(5.62, 0.35, 0.07, 0.06, 0.06, 0.04, 0.04), // 14 tail
];

// Fractions of the straight side (from the lower corner up) where paint lines and windows run.
const SILL = 0.66;
const STRIPE_TOP = 0.44;
const STRIPE_BOTTOM = 0.31;
const PINSTRIPE = 0.285;

/** Right-half outline from top centre to bottom centre; 15 points. */
function halfSection(s: Station): [number, number][] {
  const rt = Math.min(s.radiusTop, s.widthTop * 0.95, (s.top - s.bottom) * 0.45);
  const rb = Math.min(s.radiusBottom, s.widthBottom * 0.95, (s.top - s.bottom) * 0.45);
  const sideTop = s.top - rt;
  const sideBottom = s.bottom + rb;
  const sideAt = (f: number): [number, number] => {
    const y = sideBottom + (sideTop - sideBottom) * f;
    return [s.widthBottom + (s.widthTop - s.widthBottom) * f, y];
  };
  const arc = (cx: number, cy: number, r: number, from: number, to: number, count: number) =>
    Array.from({ length: count }, (_, i): [number, number] => {
      const a = (from + ((to - from) * (i + 1)) / (count + 1)) * DEG;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    });
  return [
    [0, s.top],
    [(s.widthTop - rt) * 0.5, s.top],
    [s.widthTop - rt, s.top],
    ...arc(s.widthTop - rt, sideTop, rt, 90, 0, 2),
    sideAt(1),
    sideAt(SILL),
    sideAt(STRIPE_TOP),
    sideAt(STRIPE_BOTTOM),
    sideAt(PINSTRIPE),
    sideAt(0),
    ...arc(s.widthBottom - rb, sideBottom, rb, 0, -90, 2),
    [s.widthBottom - rb, s.bottom],
    [0, s.bottom],
  ];
}

/**
 * The windshield's lower side edge runs level at glareshield height, not
 * along the section lines, so the faces it crosses are split at this height:
 * glass above, painted skin below. The cabin model in Blender does the same.
 */
export const WINDSHIELD_SILL = 0.47;

/** True for the faces that the windshield's level lower edge cuts through. */
function isWindshieldSide(band: number, segment: number): boolean {
  const k = mirrorSegment(segment);
  return (band === 4 || band === 5) && (k === 4 || k === SEG.window);
}

/** Clips a convex polygon against a horizontal plane, keeping one side. */
function clipAtHeight(points: readonly V3[], height: number, keepAbove: boolean): V3[] {
  const out: V3[] = [];
  const inside = (p: V3) => (keepAbove ? p[1] >= height : p[1] <= height);
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) {
      continue;
    }
    if (inside(a)) {
      out.push(a);
    }
    if (inside(a) !== inside(b)) {
      const t = (height - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, height, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

/** Top and bottom of the fuselage centreline at a station, for seating parts on the skin. */
function fuselageAt(z: number): { top: number; bottom: number } {
  for (let i = 0; i + 1 < STATIONS.length; i++) {
    const a = STATIONS[i];
    const b = STATIONS[i + 1];
    if (a && b && z >= a.z && z <= b.z) {
      const t = (z - a.z) / (b.z - a.z);
      return { top: a.top + (b.top - a.top) * t, bottom: a.bottom + (b.bottom - a.bottom) * t };
    }
  }
  return { top: 0, bottom: 0 };
}

/** The fuselage outline at any z, blended between the neighbouring stations. */
function ringAt(z: number): [number, number][] {
  for (let i = 0; i + 1 < STATIONS.length; i++) {
    const a = STATIONS[i];
    const b = STATIONS[i + 1];
    if (a && b && z >= a.z && z <= b.z) {
      const t = (z - a.z) / (b.z - a.z);
      const ra = sectionRing(a);
      const rb = sectionRing(b);
      return ra.map(([x, y], k) => {
        const q = rb[k] ?? [x, y, z];
        return [x + (q[0] - x) * t, y + (q[1] - y) * t];
      });
    }
  }
  return [];
}

function sectionRing(s: Station): V3[] {
  const half = halfSection(s);
  const right = half.map(([x, y]): V3 => [x, y, s.z]);
  const left = half
    .slice(1, -1)
    .reverse()
    .map(([x, y]): V3 => [-x, y, s.z]);
  return [...right, ...left];
}

// Segment k joins point k and k+1 of the right half; the left half mirrors it.
const SEG = { roof: [0, 1], corner: [2, 3, 4], window: 5, belowSill: 6, stripe: 7, pin: 8, gap: 9, lower: 10, bottomCorner: [11, 12, 13] } as const;
const HALF_SEGMENTS = 14;

function mirrorSegment(segment: number): number {
  return segment < HALF_SEGMENTS ? segment : 2 * HALF_SEGMENTS - 1 - segment;
}

function fuselagePaint(band: number, segment: number): number {
  const k = mirrorSegment(segment);
  const roof = (SEG.roof as readonly number[]).includes(k);
  const window = k === SEG.window;
  // Windshield over the top and round the corners (its lower sides are cut
  // level with the glareshield, see WINDSHIELD_SILL), then the slim A-pillar
  // (band 6) before the door window.
  if ((band === 4 || band === 5) && (roof || k === 2 || k === 3)) {
    return GLASS;
  }
  // Door window, then the B-pillar (band 8), then the rear side window.
  if ((band === 7 || band === 9) && (window || k === 4)) {
    return GLASS;
  }
  // The rear "omni-vision" window behind the wing.
  if (band === 10 && (roof || k === 2)) {
    return GLASS;
  }
  if (k === SEG.stripe && band >= 1) {
    return NAVY;
  }
  if (k === SEG.pin && band >= 1) {
    return GOLD;
  }
  if (k === SEG.lower || (SEG.bottomCorner as readonly number[]).includes(k)) {
    return BELLY;
  }
  return WHITE;
}

// ---------------------------------------------------------------------------
// Airfoils
// ---------------------------------------------------------------------------

/** NACA four-digit section: [upper y, lower y] at chord fraction x. */
function naca(x: number, thickness: number, camber: number, camberAt: number): [number, number] {
  const t = 5 * thickness * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  let yc = 0;
  if (camber > 0) {
    yc = x < camberAt ? (camber / camberAt ** 2) * (2 * camberAt * x - x * x) : (camber / (1 - camberAt) ** 2) * (1 - 2 * camberAt + 2 * camberAt * x - x * x);
  }
  return [yc + t, yc - t];
}

/**
 * Closed outline of the part of an airfoil between two chord fractions, as
 * [x, y] in chord units: upper surface forward to aft, then lower aft to forward.
 */
function airfoil(from: number, to: number, samples: number, thickness: number, camber = 0, camberAt = 0.4): [number, number][] {
  // Points bunch up toward the leading edge, where the curvature is.
  const xs = Array.from({ length: samples }, (_, i) => {
    const t = i / (samples - 1);
    return from === 0 ? to * (1 - Math.cos((t * Math.PI) / 2)) : from + (to - from) * t;
  });
  const upper = xs.map((x): [number, number] => [x, naca(x, thickness, camber, camberAt)[0]]);
  const lower = xs
    .slice()
    .reverse()
    .map((x): [number, number] => [x, naca(x, thickness, camber, camberAt)[1]]);
  // Shared leading-edge point, and a shared trailing-edge point when the section reaches it.
  if (from === 0) {
    lower.pop();
  }
  if (to === 1) {
    lower.shift();
  }
  return [...upper, ...lower];
}

// ---------------------------------------------------------------------------
// Wing
// ---------------------------------------------------------------------------

const WING_ROOT_Y = 1.075;
const WING_TE = 1.13;
const DIHEDRAL = Math.tan(1.73 * DEG);
const WING_HINGE = 0.74;

interface WingStation {
  readonly span: number;
  readonly chord: number;
  readonly leadingEdge: number;
  readonly y: number;
  readonly incidence: number;
  readonly thicknessScale: number;
}

function wingStation(span: number): WingStation {
  const a = Math.abs(span);
  const taper = Math.max(0, (a - 2.6) / (5.42 - 2.6));
  const chord = 1.63 - Math.min(1, taper) * 0.5;
  return {
    span,
    chord,
    leadingEdge: WING_TE - chord,
    y: WING_ROOT_Y + (a - 0.56) * DIHEDRAL,
    // 1.5° at the root washing out to -1.5° at the tip.
    incidence: (1.5 - 3 * Math.min(1, a / 5.42)) * DEG,
    thicknessScale: 1,
  };
}

function wingRing(station: WingStation, from: number, to: number, samples: number): V3[] {
  const cos = Math.cos(station.incidence);
  const sin = Math.sin(station.incidence);
  return airfoil(from, to, samples, 0.12 * station.thicknessScale, 0.02, 0.4).map(([cx, cy]): V3 => {
    const along = cx * station.chord;
    const up = cy * station.chord;
    return [station.span, station.y + up * cos - along * sin, station.leadingEdge + along * cos + up * sin];
  });
}

function wingPoint(span: number, chordFraction: number): V3 {
  const s = wingStation(span);
  const [u, l] = naca(chordFraction, 0.12, 0.02, 0.4);
  const along = chordFraction * s.chord;
  const up = ((u + l) / 2) * s.chord;
  return [span, s.y + up * Math.cos(s.incidence) - along * Math.sin(s.incidence), s.leadingEdge + along * Math.cos(s.incidence) + up * Math.sin(s.incidence)];
}

// ---------------------------------------------------------------------------
// Moving parts
// ---------------------------------------------------------------------------

/** A control surface that pivots about its hinge line. */
export class Hinged {
  readonly pivot = new Object3D();
  private readonly axis: Vector3;

  constructor(geometry: BufferGeometry, material: Material, hingeA: V3, hingeB: V3) {
    const a = new Vector3(...hingeA);
    this.axis = new Vector3(...hingeB).sub(a).normalize();
    geometry.translate(-a.x, -a.y, -a.z);
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = true;
    this.pivot.position.copy(a);
    this.pivot.add(mesh);
  }

  set angle(radians: number) {
    this.pivot.quaternion.setFromAxisAngle(this.axis, radians);
  }
}

export interface CessnaModel {
  readonly root: Group;
  /** Exterior parts hidden in the cockpit view. */
  readonly exterior: Object3D[];
  readonly glass: MeshStandardMaterial;
  readonly leftAileron: Hinged;
  readonly rightAileron: Hinged;
  readonly leftFlap: Hinged;
  readonly rightFlap: Hinged;
  readonly elevator: Hinged;
  readonly rudder: Hinged;
  readonly propeller: Object3D;
  readonly propDisc: Mesh;
  readonly blades: Mesh;
  readonly beacon: Mesh;
  readonly strobes: Mesh[];
}

export function buildCessna(registration = "C-CMLD"): CessnaModel {
  const paint = new MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.02, envMapIntensity: 0.6 });
  const satin = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.25 });
  // Tinted, glossy glazing: nearly opaque from outside like real tinted
  // windows (the cockpit view turns the opacity down to see out).
  const glass = new MeshStandardMaterial({
    color: 0x1f2c38,
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.86,
    side: DoubleSide,
    envMapIntensity: 1.0,
  });

  const root = new Group();
  root.name = "cessna-172";
  const exterior: Object3D[] = [];
  const add = (geometry: BufferGeometry, material: Material, isExterior = true, shadow = true) => {
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = shadow;
    root.add(mesh);
    if (isExterior) {
      exterior.push(mesh);
    }
    return mesh;
  };

  // ---- Fuselage skin and glazing ----
  const rings = STATIONS.map(sectionRing);
  const skin = new MeshBuilder();
  const glazing = new MeshBuilder();
  for (let band = 0; band + 1 < rings.length; band++) {
    const a = rings[band];
    const b = rings[band + 1];
    const sa = STATIONS[band];
    const sb = STATIONS[band + 1];
    if (!a || !b || !sa || !sb) {
      continue;
    }
    const inside: V3 = [0, (sa.top + sa.bottom + sb.top + sb.bottom) / 4, (sa.z + sb.z) / 2];
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      const color = fuselagePaint(band, i);
      const [a0, a1, b0, b1] = [a[i], a[j], b[i], b[j]];
      if (a0 && a1 && b0 && b1) {
        if (isWindshieldSide(band, i)) {
          const quad = [a0, a1, b1, b0];
          fan(glazing, clipAtHeight(quad, WINDSHIELD_SILL, true), GLASS, inside);
          fan(skin, clipAtHeight(quad, WINDSHIELD_SILL, false), color, inside);
        } else {
          (color === GLASS ? glazing : skin).quad(a0, a1, b1, b0, color, inside);
        }
      }
    }
  }
  const noseRing = rings[0];
  const tailRing = rings[rings.length - 1];
  if (noseRing && tailRing) {
    skin.cap(noseRing, WHITE, [0, 0, -1.5]);
    skin.cap(tailRing, WHITE, [0, 0.2, 5]);
  }
  // Cowl intakes either side of the spinner, and the exhaust stack.
  for (const side of [-1, 1]) {
    const ring = Array.from({ length: 8 }, (_, k): V3 => {
      const t = (k / 8) * Math.PI * 2;
      return [side * 0.205 + Math.cos(t) * 0.075, 0.0 + Math.sin(t) * 0.055, -2.145];
    });
    skin.cap(ring, COWL_DARK, [side * 0.205, 0, -2.0]);
  }
  skin.beam([0.18, -0.42, -1.5], [0.2, -0.54, -1.42], 0.035, 6, 0x6b6a66);

  // Cowl details that make its outline read from the cockpit: the seam
  // where the cowl meets the fuselage at the firewall, and the oil door.
  const seam = (z: number, grow: number) =>
    ringAt(z).map(([x, y]): V3 => {
      const mid = fuselageAt(z);
      const cy = (mid.top + mid.bottom) / 2;
      return [x * grow, cy + (y - cy) * grow, z];
    });
  skin.loft([seam(-1.426, 1.006), seam(-1.414, 1.006)], () => SEAM, false);
  const oilDoor: V3[] = [
    [-0.085, fuselageAt(-1.96).top + 0.004, -1.96],
    [0.085, fuselageAt(-1.96).top + 0.004, -1.96],
    [0.085, fuselageAt(-1.74).top + 0.004, -1.74],
    [-0.085, fuselageAt(-1.74).top + 0.004, -1.74],
  ];
  skin.cap(oilDoor, 0xd9d8d2, [0, 0, -1.85]);
  for (let k = 0; k < 4; k++) {
    const a = oilDoor[k];
    const b = oilDoor[(k + 1) % 4];
    if (a && b) {
      skin.beam([a[0], a[1] + 0.001, a[2]], [b[0], b[1] + 0.001, b[2]], 0.004, 4, SEAM);
    }
  }
  add(skin.build(CREASE), paint);
  const windows = add(glazing.build(CREASE), glass, true, false);
  windows.renderOrder = 2;

  // ---- Wings ----
  const wing = new MeshBuilder();
  // The centre section runs across the cabin roof, full chord, so the wing
  // sits on the fuselage like the real one rather than butting against it.
  wing.loft([-0.62, -0.3, 0, 0.3, 0.62].map((span) => wingRing(wingStation(span), 0, 1, 12)), () => WHITE);
  const spans = [0.6, 1.6, 2.6, 4.0, 5.38];
  for (const side of [-1, 1]) {
    const panel = spans.map((span) => wingRing(wingStation(side * span), 0, WING_HINGE, 12));
    // Drooped, rounded tip closing the full chord.
    const tipFull = wingRing(wingStation(side * 5.38), 0, 1, 12);
    const tipCap = wingRing({ ...wingStation(side * 5.5), y: wingStation(side * 5.5).y - 0.035, chord: 1.0, leadingEdge: WING_TE - 1.08, thicknessScale: 0.45 }, 0, 1, 12);
    wing.loft(panel, () => WHITE);
    wing.loft([tipFull, tipCap], () => NAVY);
    // Lift strut: an elliptical section from the lower fuselage to the wing.
    const strutTop = wingPoint(side * 2.55, 0.28);
    wing.beam([side * 0.5, -0.38, 0.0], [strutTop[0], strutTop[1] - 0.06, strutTop[2]], 0.05, 6, WHITE, 0.04);
    // Landing light in the left leading edge, pitot tube under the left wing.
    if (side < 0) {
      const lightAt = wingPoint(-2.0, 0.02);
      wing.box([lightAt[0], lightAt[1] - 0.01, lightAt[2]], [0.24, 0.06, 0.04], 0xfff7d6);
      const pitot = wingPoint(-3.6, 0.2);
      wing.beam([pitot[0], pitot[1] - 0.04, pitot[2]], [pitot[0], pitot[1] - 0.11, pitot[2] - 0.02], 0.01, 4, CHROME);
      wing.beam([pitot[0], pitot[1] - 0.11, pitot[2] + 0.02], [pitot[0], pitot[1] - 0.11, pitot[2] - 0.3], 0.012, 6, CHROME);
    }
  }
  add(wing.build(CREASE), paint);

  const controlSurface = (span0: number, span1: number, color: number) => {
    const builder = new MeshBuilder();
    builder.loft([wingRing(wingStation(span0), WING_HINGE, 1, 5), wingRing(wingStation(span1), WING_HINGE, 1, 5)], () => color);
    return new Hinged(builder.build(CREASE), paint, wingPoint(span0, WING_HINGE), wingPoint(span1, WING_HINGE));
  };
  const leftFlap = controlSurface(-0.6, -2.58, WHITE);
  const rightFlap = controlSurface(0.6, 2.58, WHITE);
  const leftAileron = controlSurface(-2.62, -5.36, WHITE);
  const rightAileron = controlSurface(2.62, 5.36, WHITE);

  // ---- Horizontal tail ----
  const STAB_Y = 0.2;
  const STAB_HINGE = 0.56;
  const stabStation = (span: number) => {
    const a = Math.min(1, Math.abs(span) / 1.72);
    const chord = 1.27 - a * 0.37;
    return { span, chord, leadingEdge: 5.62 - chord, y: STAB_Y };
  };
  const stabRing = (span: number, from: number, to: number, samples: number, scale = 1) => {
    const s = stabStation(span);
    return airfoil(from, to, samples, 0.09 * scale).map(([cx, cy]): V3 => [span, s.y + cy * s.chord, s.leadingEdge + cx * s.chord]);
  };
  const tail = new MeshBuilder();
  for (const side of [-1, 1]) {
    tail.loft([stabRing(side * 0.12, 0, STAB_HINGE, 9), stabRing(side * 1.0, 0, STAB_HINGE, 9), stabRing(side * 1.72, 0, STAB_HINGE, 9)], () => WHITE);
  }
  const elevatorBuilder = new MeshBuilder();
  elevatorBuilder.loft([stabRing(-1.76, STAB_HINGE, 1, 5, 0.6), stabRing(-1.72, STAB_HINGE, 1, 5), stabRing(1.72, STAB_HINGE, 1, 5), stabRing(1.76, STAB_HINGE, 1, 5, 0.6)], () => WHITE);
  const stabHinge = (span: number): V3 => {
    const s = stabStation(span);
    return [span, s.y, s.leadingEdge + STAB_HINGE * s.chord];
  };
  const elevator = new Hinged(elevatorBuilder.build(CREASE), paint, stabHinge(1.72), stabHinge(-1.72));

  // ---- Fin and rudder ----
  const FIN_ROOT = 0.36;
  // Overall height (ground to beacon) is the C172S's 2.72 m.
  const FIN_TIP = 1.44;
  const FIN_HINGE = 0.64;
  const finAt = (y: number) => {
    const t = (y - FIN_ROOT) / (FIN_TIP - FIN_ROOT);
    const chord = 1.62 - t * 0.86;
    // Swept leading edge (about 35°), nearly vertical trailing edge.
    return { leadingEdge: 4.08 + t * 0.92, chord };
  };
  const finRing = (y: number, from: number, to: number, samples: number, scale = 1) => {
    const f = finAt(y);
    return airfoil(from, to, samples, 0.1 * scale).map(([cx, cy]): V3 => [cy * f.chord, y, f.leadingEdge + cx * f.chord]);
  };
  tail.loft([finRing(FIN_ROOT, 0, FIN_HINGE, 9), finRing(1.3, 0, FIN_HINGE, 9), finRing(FIN_TIP, 0, FIN_HINGE, 9)], (ring) => (ring >= 1 ? NAVY : WHITE));
  // Dorsal fillet running forward along the tailcone.
  const dorsal = (z: number, height: number, halfWidth: number): V3[] => [
    [0, 0.5 - (z - 2.5) * 0.045 + height, z],
    [halfWidth, 0.5 - (z - 2.5) * 0.045, z],
    [-halfWidth, 0.5 - (z - 2.5) * 0.045, z],
  ];
  tail.loft([dorsal(2.75, 0.0, 0.03), dorsal(3.4, 0.07, 0.06), dorsal(4.1, 0.2, 0.07)], () => WHITE);
  add(tail.build(CREASE), paint);

  const rudderBuilder = new MeshBuilder();
  rudderBuilder.loft(
    [finRing(0.08, FIN_HINGE, 1, 5), finRing(FIN_ROOT, FIN_HINGE, 1, 5), finRing(1.3, FIN_HINGE, 1, 5), finRing(FIN_TIP, FIN_HINGE, 1, 5), finRing(FIN_TIP + 0.05, FIN_HINGE, 1, 5, 0.5)],
    (ring) => (ring >= 2 ? NAVY : WHITE),
  );
  const finHinge = (y: number): V3 => {
    const f = finAt(y);
    return [0, y, f.leadingEdge + FIN_HINGE * f.chord];
  };
  const rudder = new Hinged(rudderBuilder.build(CREASE), paint, finHinge(FIN_TIP), finHinge(0.08));

  // ---- Landing gear ----
  const gear = new MeshBuilder();
  const gearSatin = new MeshBuilder();
  for (const side of [-1, 1]) {
    // Mains 0.42 m behind the centre of gravity, as on the real aircraft.
    springLeg(gearSatin, [side * 0.44, -0.47, 0.42], [side * 1.15, -0.92, 0.42]);
    wheel(gear, gearSatin, [side * 1.27, -0.93, 0.42], 0.3, 0.15);
    wheelPant(gear, [side * 1.27, -0.93, 0.42], 0.3, 0.14, 1.12);
  }
  // Nose gear: oleo strut with a chrome piston, fork, and a smaller fairing.
  // Nose gear 1.65 m ahead of the mains (the C172S wheelbase).
  gearSatin.beam([0, -0.42, -1.3], [0, -0.62, -1.24], 0.06, 8, STEEL);
  gearSatin.beam([0, -0.62, -1.24], [0, -0.86, -1.24], 0.04, 8, CHROME);
  gearSatin.beam([-0.09, -0.66, -1.24], [-0.09, -0.95, -1.24], 0.018, 4, STEEL);
  gearSatin.beam([0.09, -0.66, -1.24], [0.09, -0.95, -1.24], 0.018, 4, STEEL);
  wheel(gear, gearSatin, [0, -0.95, -1.24], 0.25, 0.13);
  wheelPant(gear, [0, -0.95, -1.24], 0.25, 0.12, 0.86);
  add(gear.build(CREASE), paint);
  add(gearSatin.build(CREASE), satin);

  // ---- Propeller ----
  const hub: V3 = [0, 0.03, -2.15];
  const propeller = new Object3D();
  propeller.position.set(...hub);
  const prop = new MeshBuilder();
  const spinnerProfile: [number, number][] = [
    [0.17, 0],
    [0.168, 0.05],
    [0.155, 0.12],
    [0.125, 0.2],
    [0.08, 0.27],
    [0.03, 0.31],
    [0.0, 0.325],
  ];
  prop.loft(
    spinnerProfile.map(([r, d]) =>
      Array.from({ length: 14 }, (_, k): V3 => {
        const t = (k / 14) * Math.PI * 2;
        return [Math.cos(t) * Math.max(r, 0.0005), Math.sin(t) * Math.max(r, 0.0005), -d];
      }),
    ),
    () => WHITE,
  );
  const bladeBuilder = new MeshBuilder();
  for (const dir of [-1, 1]) {
    // Planform: narrow shank, widest near 70% radius, rounded tip. Pitch twists from root to tip.
    const sections: [number, number, number][] = [
      [0.13, 0.045, 52],
      [0.25, 0.075, 40],
      [0.45, 0.092, 27],
      [0.68, 0.096, 19],
      [0.85, 0.085, 15],
      [0.93, 0.064, 13],
      [0.965, 0.03, 12],
    ];
    const rings: V3[][] = sections.map(([r, halfChord, pitch]) => {
      const p = pitch * DEG * dir;
      const thick = halfChord * 0.22;
      const outline: [number, number][] = [
        [-halfChord, 0],
        [-halfChord * 0.4, thick],
        [halfChord * 0.5, thick * 0.6],
        [halfChord, 0],
        [halfChord * 0.5, -thick * 0.3],
        [-halfChord * 0.4, -thick * 0.5],
      ];
      return outline.map(([c, t]): V3 => [r * dir, c * Math.cos(p) - t * Math.sin(p), -0.11 + c * Math.sin(p) + t * Math.cos(p)]);
    });
    bladeBuilder.loft(rings, (ring) => (ring >= 4 ? (ring === 4 ? 0xe8e8e4 : 0xc8302c) : BLADE));
  }
  const spinner = new Mesh(prop.build(CREASE), paint);
  spinner.castShadow = true;
  const blades = new Mesh(bladeBuilder.build(CREASE), satin);
  blades.castShadow = true;
  propeller.add(spinner, blades);
  root.add(propeller);
  const propDisc = new Mesh(
    new CircleGeometry(0.965, 32),
    new MeshBasicMaterial({ color: 0x2a2c30, transparent: true, opacity: 0.14, side: DoubleSide, depthWrite: false }),
  );
  propDisc.position.set(hub[0], hub[1], hub[2] - 0.11);
  propDisc.renderOrder = 3;
  root.add(propDisc);

  // ---- Antennas ----
  const extras = new MeshBuilder();
  // Comm antennas on the tailcone, a whip under the belly, each rooted in the skin.
  for (const [z, height] of [
    [2.6, 0.32],
    [3.15, 0.26],
  ] as const) {
    const top = fuselageAt(z).top;
    extras.beam([0, top - 0.02, z], [0, top + height, z + 0.12], 0.014, 4, 0x2a2a2a, 0.008);
  }
  const belly = fuselageAt(1.5).bottom;
  extras.beam([0, belly + 0.02, 1.5], [0, belly - 0.24, 1.72], 0.008, 4, 0x2a2a2a, 0.005);
  add(extras.build(), satin);

  // ---- Registration on both sides of the tailcone ----
  const decal = registrationTexture(registration);
  for (const side of [-1, 1]) {
    // Flush with the tapering tailcone side, above the stripe.
    const plate = new Mesh(new PlaneGeometry(0.95, 0.178), new MeshBasicMaterial({ map: decal, transparent: true, depthWrite: false }));
    plate.position.set(side * 0.279, 0.25, 3.55);
    plate.rotation.y = side * (Math.PI / 2 - 0.084);
    plate.renderOrder = 1;
    root.add(plate);
    exterior.push(plate);
  }

  // ---- Lights ----
  const lamp = (color: number, at: V3, size = 0.05) => {
    const mesh = new Mesh(new MeshBuilder().box(at, [size, size * 0.7, size * 1.3], color).build(), new MeshBasicMaterial({ vertexColors: true }));
    root.add(mesh);
    exterior.push(mesh);
    return mesh;
  };
  const tip = wingStation(5.5);
  lamp(0xff2a2a, [-5.49, tip.y - 0.03, 0.18]);
  lamp(0x2aff6a, [5.49, tip.y - 0.03, 0.18]);
  lamp(0xffffff, [0, 0.21, 5.63], 0.04);
  const beacon = lamp(0xff3030, [0, FIN_TIP + 0.04, finAt(FIN_TIP).leadingEdge + 0.3], 0.07);
  const strobes = [lamp(0xffffff, [-5.49, tip.y - 0.02, 0.32], 0.04), lamp(0xffffff, [5.49, tip.y - 0.02, 0.32], 0.04)];

  for (const part of [leftFlap, rightFlap, leftAileron, rightAileron, elevator, rudder]) {
    root.add(part.pivot);
    exterior.push(part.pivot);
  }
  exterior.push(propeller, propDisc);

  return { root, exterior, glass, blades, leftAileron, rightAileron, leftFlap, rightFlap, elevator, rudder, propeller, propDisc, beacon, strobes };
}

// ---------------------------------------------------------------------------
// Gear parts
// ---------------------------------------------------------------------------

/** The tapered flat spring-steel main gear leg, wider at the fuselage. */
function springLeg(builder: MeshBuilder, from: V3, to: V3): void {
  const section = (p: V3, width: number, thick: number): V3[] => [
    [p[0], p[1] + thick, p[2] - width],
    [p[0], p[1] + thick, p[2] + width],
    [p[0], p[1] - thick, p[2] + width],
    [p[0], p[1] - thick, p[2] - width],
  ];
  builder.loft([section(from, 0.07, 0.022), section(to, 0.045, 0.018)], () => STEEL);
}

/** A tyre (a low-poly torus) with a hub, spinning about the x axis. */
/** Triangulates a convex polygon as a fan. */
function fan(builder: MeshBuilder, points: readonly V3[], color: number, inside: V3): void {
  const first = points[0];
  for (let k = 1; first && k + 1 < points.length; k++) {
    const b = points[k];
    const c = points[k + 1];
    if (b && c) {
      builder.tri(first, b, c, color, inside);
    }
  }
}

function wheel(paint: MeshBuilder, metal: MeshBuilder, center: V3, radius: number, width: number): void {
  const segments = 16;
  const tube = width / 2;
  const profile: [number, number][] = [
    [-tube * 0.8, radius - tube * 1.3],
    [-tube, radius - tube * 0.45],
    [-tube * 0.65, radius - 0.005],
    [tube * 0.65, radius - 0.005],
    [tube, radius - tube * 0.45],
    [tube * 0.8, radius - tube * 1.3],
  ];
  const rings = Array.from({ length: segments + 1 }, (_, k) => {
    const t = (k / segments) * Math.PI * 2;
    return profile.map(([dx, r]): V3 => [center[0] + dx, center[1] + Math.cos(t) * r, center[2] + Math.sin(t) * r]);
  });
  // Skin the torus by walking around the wheel; each ring is a cross-section.
  for (let k = 0; k < segments; k++) {
    const a = rings[k];
    const b = rings[k + 1];
    if (!a || !b) {
      continue;
    }
    for (let i = 0; i + 1 < a.length; i++) {
      const [a0, a1, b0, b1] = [a[i], a[i + 1], b[i], b[i + 1]];
      if (a0 && a1 && b0 && b1) {
        paint.quad(a0, a1, b1, b0, TIRE, center);
      }
    }
  }
  const hubRadius = radius - tube * 1.3;
  for (const side of [-1, 1]) {
    const ring = Array.from({ length: 12 }, (_, k): V3 => {
      const t = (k / 12) * Math.PI * 2;
      return [center[0] + side * tube * 0.8, center[1] + Math.cos(t) * hubRadius, center[2] + Math.sin(t) * hubRadius];
    });
    metal.cap(ring, HUB, center);
  }
}

/** Teardrop wheel fairing, leaving the bottom of the tyre exposed. */
function wheelPant(builder: MeshBuilder, axle: V3, tireRadius: number, halfWidth: number, length: number): void {
  // Longitudinal stations: [fraction along the pant, scale].
  const stations: [number, number][] = [
    [-0.42, 0.05],
    [-0.38, 0.45],
    [-0.3, 0.75],
    [-0.15, 0.95],
    [0.05, 1],
    [0.25, 0.85],
    [0.42, 0.5],
    [0.55, 0.06],
  ];
  const sides = 12;
  const height = tireRadius * 0.86;
  const rings = stations.map(([t, scale]) => {
    const z = axle[2] + t * length;
    // The tail of the pant sweeps up slightly, like the real fairing.
    const centerY = axle[1] + 0.06 + Math.max(0, t) * 0.14;
    return Array.from({ length: sides }, (_, k): V3 => {
      const a = (k / sides) * Math.PI * 2 + Math.PI / sides;
      const y = centerY + Math.sin(a) * height * scale;
      const lowest = axle[1] - tireRadius * 0.58;
      return [axle[0] + Math.cos(a) * halfWidth * scale, Math.max(y, lowest), z];
    });
  });
  builder.loft(rings, () => WHITE);
}

function registrationTexture(text: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#1b3a6b";
    ctx.font = "700 78px 'Inter Variable', Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 52);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
