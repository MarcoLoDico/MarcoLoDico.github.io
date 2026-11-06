import { Mesh, MeshBasicMaterial, Object3D } from "three";
import { circle, MeshBuilder, type V3 } from "../render/meshBuilder";
import { landmarkMaterial } from "./material";
import type { LandmarkSpec } from "./types";

const CONCRETE = 0xd8d4cb;
const CONCRETE_SHADE = 0xc7c2b7;
const GLASS = 0x2c3946;
const POD_WHITE = 0xf0eee8;
const RED = 0xc8202e;

/** Lathe: [radius, height] profile spun around the y axis. */
export function lathe(builder: MeshBuilder, profile: readonly [number, number][], sides: number, color: (band: number) => number, phase = 0): void {
  const rings = profile.map(([r, y]) => circle(0, y, 0, Math.max(r, 0.01), sides, phase));
  builder.loft(rings, (band) => color(band));
}

/** The CN Tower, 553.3 m: Y-shaped concrete shaft, main pod at 342–360 m, SkyPod at 447 m, antenna. */
function buildCnTower(): Object3D {
  const b = new MeshBuilder();

  // Y-shaped shaft: three tapering wings around a hexagonal core.
  const shaftLevels: [number, number, number, number][] = [
    // y, wing length, wing half-thickness, core radius
    [-25, 31, 5.5, 9],
    [0, 30, 5.5, 9],
    [40, 24, 5, 8.5],
    [110, 18, 4.6, 8],
    [220, 14, 4.2, 7.5],
    [334, 11.5, 4, 7],
  ];
  const yRing = ([y, length, half, core]: [number, number, number, number]): V3[] => {
    const points: V3[] = [];
    for (let k = 0; k < 3; k++) {
      const a = (90 + k * 120) * (Math.PI / 180);
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const px = -dz;
      const pz = dx;
      points.push([dx * length - px * half, y, dz * length - pz * half]);
      points.push([dx * length + px * half, y, dz * length + pz * half]);
      const between = a + (60 * Math.PI) / 180;
      points.push([Math.cos(between) * core * 0.75, y, Math.sin(between) * core * 0.75]);
    }
    return points;
  };
  // Glass elevator faces run up the tips of the wings.
  b.loft(shaftLevels.map(yRing), (band, segment) => (segment % 3 === 0 && band >= 1 ? GLASS : band % 2 === 0 ? CONCRETE : CONCRETE_SHADE));

  // Main pod: white rings and dark glass bands, the 360 Restaurant on top.
  lathe(
    b,
    [
      [11, 332],
      [19, 336],
      [22.5, 340],
      [22.8, 343],
      [21.2, 344],
      [21.2, 351],
      [23, 352],
      [23, 355.5],
      [18.5, 356.5],
      [18.5, 362],
      [15.5, 364.5],
      [10.5, 367.5],
      [6.5, 369],
    ],
    24,
    (band) => (band === 4 || band === 8 ? GLASS : POD_WHITE),
  );

  // Upper shaft to the SkyPod.
  lathe(
    b,
    [
      [6.6, 368],
      [5.2, 444],
    ],
    6,
    () => CONCRETE,
  );
  lathe(
    b,
    [
      [5.2, 443],
      [8.2, 446],
      [8.6, 447.5],
      [8.6, 451],
      [6.2, 453.5],
      [3.6, 456],
    ],
    16,
    (band) => (band === 2 ? GLASS : POD_WHITE),
  );

  // Antenna mast: tapering, banded red and white near the top.
  const antennaSegments = 12;
  for (let i = 0; i < antennaSegments; i++) {
    const y0 = 456 + i * 8.1;
    const y1 = y0 + 8.1;
    const r0 = 3.2 - (i / antennaSegments) * 2.8;
    const r1 = 3.2 - ((i + 1) / antennaSegments) * 2.8;
    const color = i >= 7 && i % 2 === 1 ? RED : 0xe2e2e0;
    b.loft([circle(0, y0, 0, r0, 6), circle(0, y1, 0, r1, 6)], () => color);
  }

  // Base: a low plaza and the glass entry pavilion.
  lathe(
    b,
    [
      [46, -6],
      [46, 0.5],
      [44, 1],
    ],
    24,
    () => 0xb9b4aa,
  );
  b.box([-20, 5, 32], [40, 10, 18], GLASS, 0x9a958c);

  const tower = new Object3D();
  const mesh = new Mesh(b.build(28), landmarkMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tower.add(mesh);

  // Aviation light at the tip.
  const light = new Mesh(new MeshBuilder().box([0, 554, 0], [1.4, 1.4, 1.4], 0xff2a2a).build(), new MeshBasicMaterial({ vertexColors: true }));
  light.name = "beacon";
  tower.add(light);
  return tower;
}

/** Rogers Centre: 205 m concrete drum with a four-panel retractable roof. */
function buildRogersCentre(): Object3D {
  const b = new MeshBuilder();
  lathe(
    b,
    [
      [103, -4],
      [103, 18],
      [102, 19],
      [102, 27],
      [103, 28],
      [103, 40],
    ],
    32,
    (band) => (band === 2 ? 0x37414c : band % 2 === 0 ? 0xcfcac0 : 0xd9d5cc),
  );
  // Roof shells: alternate tones on each segment, like the overlapping panels.
  const roof: [number, number][] = [
    [103, 40],
    [98, 52],
    [86, 64],
    [66, 75],
    [40, 82],
    [12, 85.5],
    [0.5, 86],
  ];
  const rings = roof.map(([r, y]) => circle(0, y, 0, r, 32));
  b.loft(rings, (_band, segment) => {
    const panel = Math.floor(((segment + 4) % 32) / 8);
    return [0xe7e5df, 0xd6d3cc, 0xe0ddd6, 0xcdcac2][panel] ?? 0xe0ddd6;
  });
  const mesh = new Mesh(b.build(25), landmarkMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new Object3D();
  group.add(mesh);
  return group;
}

export const torontoLandmarks: readonly LandmarkSpec[] = [
  {
    id: "cn-tower",
    name: "CN Tower",
    lat: 43.64256,
    lon: -79.38709,
    exclusionRadius: 60,
    baseAltitude: null,
    build: buildCnTower,
    colliders: [
      { kind: "cylinder", x: 0, z: 0, radius: 26, bottom: -10, top: 332 },
      { kind: "cylinder", x: 0, z: 0, radius: 23.5, bottom: 332, top: 370 },
      { kind: "cylinder", x: 0, z: 0, radius: 9, bottom: 370, top: 456 },
      { kind: "cylinder", x: 0, z: 0, radius: 3.5, bottom: 456, top: 554 },
    ],
  },
  {
    id: "rogers-centre",
    name: "Rogers Centre",
    lat: 43.64141,
    lon: -79.38917,
    exclusionRadius: 112,
    baseAltitude: null,
    build: buildRogersCentre,
    colliders: [{ kind: "cylinder", x: 0, z: 0, radius: 104, bottom: -10, top: 86 }],
  },
];
