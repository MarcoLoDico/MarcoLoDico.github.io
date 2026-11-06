import { Mesh, Object3D } from "three";
import { circle, MeshBuilder } from "../render/meshBuilder";
import { landmarkMaterial } from "./material";
import type { LandmarkSpec } from "./types";

// University of Waterloo, main campus. Footprints and heights are approximate,
// built to be recognisable from the air rather than survey-accurate.

const CONCRETE = 0xcfc8b8;
const CONCRETE_DARK = 0xb3ab9b;
const BRICK = 0xa8846a;
const BRICK_LIGHT = 0xb99a7e;
const WINDOW = 0x34404b;
const GLASS_TEAL = 0x5f8f99;
const STEEL = 0xc5c9cc;
const PINK = 0xff6fa8;

function finish(builder: MeshBuilder, yaw = 0): Object3D {
  const mesh = new Mesh(builder.build(), landmarkMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new Object3D();
  group.rotation.y = yaw;
  group.add(mesh);
  return group;
}

/** A storey band: dark ribbon window over a solid spandrel. */
function floors(b: MeshBuilder, cx: number, cz: number, w: number, d: number, y0: number, count: number, height: number, wall: number): void {
  for (let i = 0; i < count; i++) {
    const y = y0 + i * height;
    b.box([cx, y + height * 0.3, cz], [w, height * 0.6, d], wall);
    b.box([cx, y + height * 0.8, cz], [w - 0.4, height * 0.4, d - 0.4], WINDOW);
  }
}

/** Dana Porter Library: the "stack of books", wider upper floors cantilevered over a narrow base. */
function buildDanaPorter(): Object3D {
  const b = new MeshBuilder();
  b.box([0, -3, 0], [56, 6, 48], CONCRETE_DARK);
  floors(b, 0, 0, 52, 44, 0, 2, 4.5, CONCRETE);
  b.box([0, 13, 0], [28, 8, 28], CONCRETE_DARK);
  const widths = [34, 37, 40, 42, 44, 44];
  widths.forEach((w, i) => {
    floors(b, 0, 0, w, w, 17 + i * 4.2, 1, 4.2, CONCRETE);
  });
  b.box([0, 44.6, 0], [44, 0.8, 44], CONCRETE_DARK);
  b.box([6, 47, -4], [14, 4, 10], CONCRETE_DARK);
  return finish(b);
}

/** Davis Centre: a big, low brick building with sawtooth skylights and silver ductwork. */
function buildDavisCentre(): Object3D {
  const b = new MeshBuilder();
  b.box([0, 4, 0], [128, 18, 104], BRICK);
  b.box([0, 13.5, 0], [128.4, 1, 104.4], BRICK_LIGHT);
  // Sawtooth glazing over the central atrium.
  for (let i = 0; i < 6; i++) {
    const z = -30 + i * 12;
    b.box([0, 15.5, z], [56, 3, 6], GLASS_TEAL, 0x8fb5bd);
  }
  // The rooftop ducts and stacks DC is known for.
  for (let i = 0; i < 4; i++) {
    const x = -50 + i * 33;
    b.beam([x, 16.5, -46], [x, 16.5, 46], 1.6, 8, STEEL);
  }
  for (const [x, z] of [
    [-58, -44],
    [-58, 44],
    [58, -44],
    [58, 44],
    [0, 48],
  ] as const) {
    b.loft([circle(x, 13, z, 2.2, 8), circle(x, 24, z, 2.2, 8)], () => STEEL);
  }
  return finish(b, 0.05);
}

/** Mathematics & Computer: long brutalist concrete with ribbon windows, and the Pink Tie. */
function buildMC(): Object3D {
  const b = new MeshBuilder();
  b.box([0, -3, 0], [150, 6, 46], CONCRETE_DARK);
  floors(b, 0, 0, 150, 44, 0, 4, 4.2, 0xb8b2a6);
  b.box([0, 17.2, 0], [150, 0.6, 44], CONCRETE_DARK);
  // Taller block at the east end.
  floors(b, 52, 0, 40, 40, 16.8, 2, 4.2, 0xb8b2a6);
  b.box([52, 25.6, 0], [40, 0.8, 40], CONCRETE_DARK);
  // The Pink Tie, hung on the south face.
  const z = 22.3;
  b.quad([-4, 15, z], [4, 15, z], [3, 12, z], [-3, 12, z], PINK, [0, 14, 0]);
  b.quad([-3, 12, z], [3, 12, z], [5, 1, z], [0, -1.5, z], PINK, [0, 8, 0]);
  b.tri([-3, 12, z], [0, -1.5, z], [-5, 1, z], PINK, [0, 8, 0]);
  // Long axis runs north–south, so the tie hangs on the west face.
  return finish(b, Math.PI / 2 + 0.04);
}

/** Engineering 7: seven storeys of blue-green glass with white floor plates. */
function buildE7(): Object3D {
  const b = new MeshBuilder();
  b.box([0, -3, 0], [64, 6, 50], CONCRETE_DARK);
  for (let i = 0; i < 7; i++) {
    const shift = i % 2 === 0 ? 0 : 1.2;
    b.box([shift, i * 4.4 + 2, 0], [60, 3.6, 46], GLASS_TEAL);
    b.box([shift, i * 4.4 + 4.1, 0], [61, 0.8, 47], 0xeeeeea);
  }
  b.box([10, 32, 4], [16, 3, 12], CONCRETE_DARK);
  return finish(b, 0.06);
}

/** Engineering 5: home of the design teams, glass and buff brick. */
function buildE5(): Object3D {
  const b = new MeshBuilder();
  b.box([0, -3, 0], [72, 6, 42], CONCRETE_DARK);
  floors(b, 0, 0, 70, 40, 0, 6, 4.3, BRICK_LIGHT);
  b.box([-30, 13, 0], [10, 26, 40.5], GLASS_TEAL);
  b.box([0, 26.2, 0], [70, 0.6, 40], CONCRETE_DARK);
  return finish(b, 0.06);
}

const building = (
  id: string,
  name: string,
  lat: number,
  lon: number,
  radius: number,
  height: number,
  build: () => Object3D,
): LandmarkSpec => ({
  id,
  name,
  lat,
  lon,
  exclusionRadius: radius,
  baseAltitude: null,
  build,
  colliders: [{ kind: "cylinder", x: 0, z: 0, radius: radius * 0.8, bottom: -10, top: height }],
});

export const waterlooLandmarks: readonly LandmarkSpec[] = [
  building("dana-porter", "Dana Porter Library", 43.46973, -80.54227, 34, 49, buildDanaPorter),
  building("davis-centre", "Davis Centre", 43.47243, -80.542, 72, 24, buildDavisCentre),
  building("mc", "Mathematics & Computer", 43.4719, -80.54356, 78, 26, buildMC),
  building("e7", "Engineering 7", 43.47266, -80.53956, 40, 35, buildE7),
  building("e5", "Engineering 5", 43.47355, -80.5402, 42, 27, buildE5),
];
