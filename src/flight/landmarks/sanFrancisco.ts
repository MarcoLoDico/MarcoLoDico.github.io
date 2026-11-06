import { Mesh, Object3D } from "three";
import { circle, MeshBuilder, type V3 } from "../render/meshBuilder";
import { landmarkMaterial } from "./material";
import { lathe } from "./toronto";
import { offsetLatLon } from "../sim/geo";
import { rotateYaw, type Collider, type LandmarkSpec } from "./types";

const ORANGE = 0xc0392b;
const ORANGE_SHADE = 0xa8321f;
const ROAD = 0x47484c;
const CONCRETE = 0xbdb8ae;
const LANE = 0xe9e6dc;

// Golden Gate geometry (metres): 1,280 m main span, 343 m side spans,
// towers 227 m above the water, road deck at 67 m. The axis runs 354.7° true.
const TOWER_S = 640;
const ANCHOR_S = 983;
const DECK_TOP = 67;
const DECK_HALF = 14.5;
const DECK_NORTH = 1290;
const DECK_SOUTH = -1310;
const LEG_X = 19;
const CABLE_X = 16.5;
const TOWER_TOP = 227;
const SADDLE = 226;
const MID_CABLE = 81;
const BRIDGE_YAW = 5.3 * (Math.PI / 180);

/** Height of the main cable at a distance s along the bridge (north positive). */
function cableHeight(s: number): number {
  const a = Math.abs(s);
  if (a <= TOWER_S) {
    return MID_CABLE + (SADDLE - MID_CABLE) * (a / TOWER_S) ** 2;
  }
  const u = Math.min(1, (a - TOWER_S) / (ANCHOR_S - TOWER_S));
  return SADDLE + (70 - SADDLE) * u - 48 * u * (1 - u);
}

function buildGoldenGate(): Object3D {
  const b = new MeshBuilder();
  // Bridge-aligned coordinates: x across, z = -s (north is -z).
  const at = (x: number, y: number, s: number): V3 => [x, y, -s];

  // Deck: orange stiffening truss, road surface, railings, and lane dashes.
  const deckLength = DECK_NORTH - DECK_SOUTH;
  const deckMid = (DECK_NORTH + DECK_SOUTH) / 2;
  b.box(at(0, DECK_TOP - 4, deckMid), [DECK_HALF * 2, 8, deckLength], ORANGE, ROAD);
  for (const side of [-1, 1]) {
    b.box(at(side * (DECK_HALF - 0.3), DECK_TOP + 0.6, deckMid), [0.6, 1.2, deckLength], ORANGE_SHADE);
  }
  for (let s = DECK_SOUTH + 20; s < DECK_NORTH - 20; s += 36) {
    for (const x of [-7, -3.5, 3.5, 7]) {
      b.box(at(x, DECK_TOP + 0.03, s), [0.25, 0.06, 10], LANE);
    }
  }

  // Towers: two stepped legs each, with art-deco portal struts.
  const tiers: [number, number, number, number][] = [
    [-12, 75, 9, 16],
    [75, 135, 8, 14],
    [135, 185, 7.2, 12],
    [185, TOWER_TOP, 6.4, 10],
  ];
  for (const s of [-TOWER_S, TOWER_S]) {
    for (const side of [-1, 1]) {
      for (const [y0, y1, width, depth] of tiers) {
        b.box(at(side * LEG_X, (y0 + y1) / 2, s), [width, y1 - y0, depth], ORANGE, ORANGE_SHADE);
      }
      // Cable saddle housing on top of each leg.
      b.box(at(side * LEG_X, TOWER_TOP + 1.5, s), [5.5, 3, 7], ORANGE_SHADE);
    }
    for (const [y0, y1] of [
      [48, 57],
      [96, 106],
      [141, 150],
      [186, 195],
      [217, TOWER_TOP],
    ] as const) {
      b.box(at(0, (y0 + y1) / 2, s), [LEG_X * 2 - 6, y1 - y0, 5], ORANGE);
    }
    // Concrete pier and fender at the waterline.
    b.box(at(0, -4, s), [64, 16, s < 0 ? 44 : 34], CONCRETE);
  }

  // Anchorages where the cables come down at each end.
  for (const s of [-ANCHOR_S, ANCHOR_S]) {
    b.box(at(0, 30, s), [50, 80, 46], CONCRETE, 0xa9a49a);
  }

  // Approach viaducts beyond the anchorages.
  const piers = (from: number, to: number) => {
    for (let s = from; Math.abs(s) < Math.abs(to); s += Math.sign(to) * 55) {
      for (const side of [-1, 1]) {
        b.box(at(side * 9, (DECK_TOP - 8 - 30) / 2, s), [4, DECK_TOP - 8 + 30, 6], ORANGE_SHADE);
      }
    }
  };
  piers(ANCHOR_S + 50, DECK_NORTH);
  piers(-ANCHOR_S - 50, DECK_SOUTH);

  // Main cables and vertical suspenders.
  for (const side of [-1, 1]) {
    const x = side * CABLE_X;
    const samples: number[] = [];
    for (let s = -ANCHOR_S; s <= ANCHOR_S; s += 20) {
      samples.push(s);
    }
    samples.push(ANCHOR_S);
    for (let k = 0; k + 1 < samples.length; k++) {
      const s0 = samples[k] ?? 0;
      const s1 = samples[k + 1] ?? 0;
      b.beam(at(x, cableHeight(s0), s0), at(x, cableHeight(s1), s1), 0.9, 6, ORANGE);
    }
    for (let s = -ANCHOR_S + 15; s < ANCHOR_S - 10; s += 15.24) {
      if (Math.abs(Math.abs(s) - TOWER_S) < 6) {
        continue;
      }
      b.beam(at(x, cableHeight(s) - 0.5, s), at(side * (DECK_HALF - 0.3), DECK_TOP + 1, s), 0.22, 4, ORANGE_SHADE);
    }
  }

  const mesh = new Mesh(b.build(), landmarkMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new Object3D();
  const aligned = new Object3D();
  aligned.rotation.y = BRIDGE_YAW;
  aligned.add(mesh);
  group.add(aligned);
  return group;
}

function bridgeBox(s: number, halfX: number, halfZ: number, bottom: number, top: number): Collider {
  const [x, z] = rotateYaw(0, -s, BRIDGE_YAW);
  return { kind: "box", x, z, halfX, halfZ, yaw: BRIDGE_YAW, bottom, top };
}

/**
 * Sutro Tower, 298 m: three legs in red-and-white aviation bands, braced by
 * two triangular crossarm levels whose arms reach past the legs, with
 * antenna masts on top.
 */
function buildSutroTower(): Object3D {
  const b = new MeshBuilder();
  const RED = 0xc8202e;
  const WHITE = 0xeeeeea;
  const legAt = (k: number, y: number): V3 => {
    const a = ((90 + k * 120) * Math.PI) / 180;
    const r = 24 - (y / 255) * 9;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  };
  for (let k = 0; k < 3; k++) {
    // Each leg is a tapering prism, banded in 21 m sections.
    for (let y = 0; y < 255; y += 21) {
      const y1 = Math.min(255, y + 21);
      b.beam(legAt(k, y), legAt(k, y1), 2.6 - (y / 255) * 1.2, 4, Math.floor(y / 21) % 2 === 0 ? RED : WHITE, 2.6 - (y1 / 255) * 1.2);
    }
    // Antenna masts on top of each leg.
    const top = legAt(k, 255);
    b.beam(top, [top[0] * 0.9, 298 - k * 6, top[2] * 0.9], 0.9, 4, k === 0 ? RED : WHITE, 0.35);
  }
  for (const level of [160, 236]) {
    for (let k = 0; k < 3; k++) {
      const a = legAt(k, level);
      const c = legAt((k + 1) % 3, level);
      b.beam(a, c, 1.4, 4, RED);
      // Arms reaching out past each leg, the tower's "pitchfork" silhouette.
      b.beam(a, [a[0] * 1.55, level, a[2] * 1.55], 1.1, 4, WHITE);
    }
  }
  // Diagonal bracing between the legs low down.
  for (let k = 0; k < 3; k++) {
    b.beam(legAt(k, 10), legAt((k + 1) % 3, 80), 0.8, 4, WHITE);
    b.beam(legAt((k + 1) % 3, 10), legAt(k, 80), 0.8, 4, WHITE);
  }
  const mesh = new Mesh(b.build(), landmarkMaterial);
  mesh.castShadow = true;
  const group = new Object3D();
  group.add(mesh);
  return group;
}

/** Transamerica Pyramid, 260 m: a tapering four-sided tower with a spire and side "wings". */
function buildTransamerica(): Object3D {
  const b = new MeshBuilder();
  const square = (y: number, half: number): V3[] => circle(0, y, 0, half * Math.SQRT2, 4, Math.PI / 4);
  const levels: [number, number][] = [];
  for (let y = 0; y <= 212; y += 8) {
    levels.push([y, 26.5 - (y / 212) * 19.5]);
  }
  b.loft(
    levels.map(([y, half]) => square(y, half)),
    (band) => (band % 2 === 0 ? 0xeeede8 : 0xb7bcc2),
  );
  b.loft(
    [square(212, 7), square(236, 3.2), square(260, 0.3)],
    () => 0xf2f1ec,
  );
  for (const side of [-1, 1]) {
    // Elevator and stair wings on the east and west faces.
    for (let y = 92; y < 222; y += 13) {
      const half = 26.5 - (y / 212) * 19.5;
      b.box([side * (half + 1.6), y + 6.5, 0], [4.4, 13, 15], 0xe6e5e0);
    }
  }
  lathe(b, [[34, -5], [34, 0.5]], 4, () => 0x8e9a7e);
  const mesh = new Mesh(b.build(), landmarkMaterial);
  mesh.castShadow = true;
  const group = new Object3D();
  group.add(mesh);
  return group;
}

/** Salesforce Tower, 326 m: a rounded square, tapering, with an open lattice crown. */
function buildSalesforce(): Object3D {
  const b = new MeshBuilder();
  const roundedSquare = (y: number, half: number, corner: number): V3[] => {
    const points: V3[] = [];
    for (let q = 0; q < 4; q++) {
      const cx = (q === 0 || q === 3 ? 1 : -1) * (half - corner);
      const cz = (q < 2 ? 1 : -1) * (half - corner);
      for (let k = 0; k < 4; k++) {
        const a = ((q * 90 + k * 30) * Math.PI) / 180;
        points.push([cx + Math.cos(a) * corner, y, cz + Math.sin(a) * corner]);
      }
    }
    return points;
  };
  const levels: number[] = [];
  for (let y = 0; y <= 296; y += 12) {
    levels.push(y);
  }
  levels.push(300);
  b.loft(
    levels.map((y) => roundedSquare(y, 26 - (y / 326) * 6, 9)),
    (band) => (band % 3 === 0 ? 0xdfe3e6 : 0x9fb3c3),
  );
  b.loft(
    [roundedSquare(300, 20.2, 8), roundedSquare(326, 15.5, 6)],
    () => 0xd9dee3,
  );
  const mesh = new Mesh(b.build(30), landmarkMaterial);
  mesh.castShadow = true;
  const group = new Object3D();
  group.add(mesh);
  return group;
}

export const sanFranciscoLandmarks: readonly LandmarkSpec[] = [
  {
    id: "golden-gate-bridge",
    name: "Golden Gate Bridge",
    lat: 37.819725,
    lon: -122.47873,
    exclusionRadius: 0,
    // OSM maps the towers as tall "buildings"; clear them so they don't show inside ours.
    extraExclusions: [-TOWER_S, TOWER_S, -ANCHOR_S, ANCHOR_S].map((s) => ({
      ...offsetLatLon({ lat: 37.819725, lon: -122.47873 }, 354.7, s),
      radius: 45,
    })),
    baseAltitude: 0,
    build: buildGoldenGate,
    colliders: [
      bridgeBox(-TOWER_S, LEG_X + 5, 8, -20, TOWER_TOP + 3),
      bridgeBox(TOWER_S, LEG_X + 5, 8, -20, TOWER_TOP + 3),
      bridgeBox(-ANCHOR_S, 25, 23, -20, 70),
      bridgeBox(ANCHOR_S, 25, 23, -20, 70),
      // The deck's sides and underside; its top is a surface you can land on.
      bridgeBox((DECK_NORTH + DECK_SOUTH) / 2, DECK_HALF, (DECK_NORTH - DECK_SOUTH) / 2, DECK_TOP - 8, DECK_TOP - 1.5),
    ],
    surfaces: [
      {
        x: rotateYaw(0, -(DECK_NORTH + DECK_SOUTH) / 2, BRIDGE_YAW)[0],
        z: rotateYaw(0, -(DECK_NORTH + DECK_SOUTH) / 2, BRIDGE_YAW)[1],
        halfX: DECK_HALF,
        halfZ: (DECK_NORTH - DECK_SOUTH) / 2,
        yaw: BRIDGE_YAW,
        top: DECK_TOP,
      },
    ],
  },
  {
    id: "sutro-tower",
    name: "Sutro Tower",
    lat: 37.7552,
    lon: -122.45286,
    exclusionRadius: 70,
    baseAltitude: null,
    build: buildSutroTower,
    colliders: [{ kind: "cylinder", x: 0, z: 0, radius: 26, bottom: -10, top: 298 }],
  },
  {
    id: "transamerica-pyramid",
    name: "Transamerica Pyramid",
    lat: 37.79519,
    lon: -122.40279,
    exclusionRadius: 40,
    baseAltitude: null,
    build: buildTransamerica,
    colliders: [
      { kind: "cylinder", x: 0, z: 0, radius: 30, bottom: -10, top: 110 },
      { kind: "cylinder", x: 0, z: 0, radius: 18, bottom: 110, top: 215 },
      { kind: "cylinder", x: 0, z: 0, radius: 5, bottom: 215, top: 260 },
    ],
  },
  {
    id: "salesforce-tower",
    name: "Salesforce Tower",
    lat: 37.7897,
    lon: -122.3969,
    exclusionRadius: 40,
    baseAltitude: null,
    build: buildSalesforce,
    colliders: [{ kind: "cylinder", x: 0, z: 0, radius: 28, bottom: -10, top: 326 }],
  },
];
