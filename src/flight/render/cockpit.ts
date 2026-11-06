import {
  BackSide,
  BufferAttribute,
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
  type BufferGeometry,
  type Material,
} from "three";
import { MeshBuilder, type V3 } from "./meshBuilder";

/**
 * The C172S cockpit in the aircraft's body frame (x right, y up, -z forward;
 * the pilot's eye is at about (-0.27, 0.8, -0.08)). The layout follows the
 * real steam-gauge 172S panel: six-pack in front of the pilot, VOR heads to
 * its right, the radio stack in the middle, fuel and engine gauges on the
 * right, push-pull engine controls low in the centre. Instruments are drawn
 * on a canvas and mapped onto the gauge faces, so every needle is live.
 */

export interface InstrumentState {
  readonly airspeedKt: number;
  readonly pitchDeg: number;
  readonly bankDeg: number;
  readonly altitudeFt: number;
  readonly headingDeg: number;
  readonly verticalSpeedFpm: number;
  /** Degrees per second, positive right. */
  readonly turnRateDeg: number;
  /** Lateral acceleration in g, positive when the ball should go right. */
  readonly slip: number;
  readonly rpm: number;
  readonly throttle: number;
  readonly flapDeg: number;
  readonly flapNotch: number;
  readonly elevator: number;
  readonly aileron: number;
  readonly rudder: number;
  readonly brake: number;
}

export interface Cockpit {
  readonly root: Group;
  update(state: InstrumentState): void;
}

const PANEL_Z = -0.86;
const FLOOR_Y = -0.3;
const PANEL_GRAY = 0x5a5d62;
const PANEL_EDGE = 0x4a4d52;
const GLARESHIELD = 0x1b1d21;
const BEZEL = 0x101112;
const CARPET = 0x45423c;
const LEATHER = 0x7c756a;
const LEATHER_DARK = 0x5a554d;
const CHROME = 0xc9ccd0;
const PLACARD = 0xe8e6df;

const CELL = 256;
const ATLAS_COLUMNS = 4;
const ATLAS_ROWS = 3;
type GaugeName = "asi" | "ai" | "alt" | "tc" | "hi" | "vsi" | "tach" | "vor1" | "vor2" | "clock" | "fuel" | "engine";
const CELLS: Record<GaugeName, [number, number]> = {
  asi: [0, 0],
  ai: [1, 0],
  alt: [2, 0],
  tc: [3, 0],
  hi: [0, 1],
  vsi: [1, 1],
  tach: [2, 1],
  vor1: [3, 1],
  vor2: [0, 2],
  clock: [1, 2],
  fuel: [2, 2],
  engine: [3, 2],
};

/** Height of the panel's top edge across its width: an arc that drops toward the doors. */
function panelTop(x: number): number {
  return 0.43 - x * x * 0.26;
}

/** Remaps a geometry's 0–1 texture coordinates onto one atlas cell. */
function mapToCell(geometry: BufferGeometry, cell: [number, number]): BufferGeometry {
  const uv = geometry.getAttribute("uv") as BufferAttribute;
  const [column, row] = cell;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (column + uv.getX(i)) / ATLAS_COLUMNS, 1 - (row + 1) / ATLAS_ROWS + uv.getY(i) / ATLAS_ROWS);
  }
  return geometry;
}

/** A ring of points around the z axis (a circle facing the pilot). */
function ringZ(cx: number, cy: number, z: number, radius: number, sides: number): V3[] {
  return Array.from({ length: sides }, (_, k): V3 => {
    const t = (k / sides) * Math.PI * 2;
    return [cx + Math.cos(t) * radius, cy + Math.sin(t) * radius, z];
  });
}

/** A rounded square in the panel plane, for instrument bezels. */
function roundedSquare(cx: number, cy: number, z: number, half: number, corner: number): V3[] {
  const points: V3[] = [];
  for (let q = 0; q < 4; q++) {
    const sx = q === 0 || q === 3 ? 1 : -1;
    const sy = q < 2 ? 1 : -1;
    for (let k = 0; k <= 3; k++) {
      const a = ((q * 90 + k * 30) * Math.PI) / 180;
      points.push([cx + sx * (half - corner) + Math.cos(a) * corner, cy + sy * (half - corner) + Math.sin(a) * corner, z]);
    }
  }
  return points;
}

/** A round instrument hole in the light panel: a thin black rim and the recess down to the dial. */
function instrumentBezel(b: MeshBuilder, cx: number, cy: number, radius: number): void {
  const z = PANEL_Z;
  const sides = 32;
  b.loft([ringZ(cx, cy, z + 0.001, radius + 0.007, sides), ringZ(cx, cy, z + 0.004, radius + 0.005, sides), ringZ(cx, cy, z + 0.004, radius + 0.001, sides)], () => BEZEL, false);
  b.loft([ringZ(cx, cy, z + 0.004, radius + 0.001, sides), ringZ(cx, cy, z + 0.0015, radius, sides)], () => 0x060606, false);
}

/** A flat label plate (placards, switch legends). */
function placard(b: MeshBuilder, cx: number, cy: number, width: number, height: number, color = PLACARD): void {
  const z = PANEL_Z + 0.0012;
  b.quad([cx - width / 2, cy - height / 2, z], [cx + width / 2, cy - height / 2, z], [cx + width / 2, cy + height / 2, z], [cx - width / 2, cy + height / 2, z], color, [cx, cy, z - 1]);
}

function addMesh(parent: Object3D, geometry: BufferGeometry, material: Material): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function buildCockpit(): Cockpit {
  const root = new Group();
  root.name = "cockpit";
  const matte = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 });
  const satin = new MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35 });
  const soft = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: DoubleSide });
  const crease = 32;

  // ---- Panel structure ----
  const panel = new MeshBuilder();
  // The panel face: light grey, its top edge following the glareshield's arc,
  // its ends wrapping back toward the doors.
  const top = 0.43;
  const bottom = -0.06;
  const xs = [-0.5, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5];
  for (let k = 0; k + 1 < xs.length; k++) {
    const x0 = xs[k] ?? 0;
    const x1 = xs[k + 1] ?? 0;
    panel.quad([x0, bottom, PANEL_Z], [x1, bottom, PANEL_Z], [x1, panelTop(x1), PANEL_Z], [x0, panelTop(x0), PANEL_Z], PANEL_GRAY, [0, 0.2, PANEL_Z - 1]);
  }
  for (const side of [-1, 1]) {
    panel.quad([side * 0.5, bottom, PANEL_Z], [side * 0.55, bottom, PANEL_Z + 0.09], [side * 0.55, panelTop(0.55), PANEL_Z + 0.09], [side * 0.5, panelTop(0.5), PANEL_Z], PANEL_EDGE, [0, 0.2, PANEL_Z - 1]);
  }
  // Lower lip and knee bolster, sloping back down toward the floor.
  panel.quad([-0.55, bottom, PANEL_Z + 0.09], [0.55, bottom, PANEL_Z + 0.09], [0.55, bottom, PANEL_Z], [-0.55, bottom, PANEL_Z], PANEL_EDGE, [0, 0, PANEL_Z]);
  panel.quad([-0.53, -0.2, PANEL_Z - 0.06], [0.53, -0.2, PANEL_Z - 0.06], [0.53, bottom, PANEL_Z + 0.02], [-0.53, bottom, PANEL_Z + 0.02], 0x26282c, [0, -0.3, PANEL_Z - 0.5]);
  addMesh(root, panel.build(), matte);

  // Padded glareshield: a rounded lip over the panel that runs forward to the windshield.
  const glare = new MeshBuilder();
  const glareProfile: [number, number][] = [
    [top - 0.012, PANEL_Z + 0.004],
    [top + 0.006, PANEL_Z + 0.026],
    [top + 0.026, PANEL_Z + 0.02],
    [top + 0.034, PANEL_Z - 0.01],
    [top + 0.04, PANEL_Z - 0.2],
    [top + 0.048, PANEL_Z - 0.44],
  ];
  const glareSection = (x: number, inset: number): V3[] =>
    glareProfile.map(([y, z]): V3 => [x, y - (top - panelTop(x)), z + inset]);
  glare.loft(
    [-0.56, -0.45, -0.25, 0, 0.25, 0.45, 0.56].map((x) => glareSection(x, Math.abs(x) > 0.5 ? 0.06 : 0)),
    () => GLARESHIELD,
  );
  addMesh(root, glare.build(crease), new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 }));

  // ---- Instrument housings and small fittings ----
  const fittings = new MeshBuilder();
  const R = 0.04;
  const sixPack: [GaugeName, number, number][] = [
    ["asi", -0.388, 0.315],
    ["ai", -0.27, 0.315],
    ["alt", -0.152, 0.315],
    ["tc", -0.388, 0.2],
    ["hi", -0.27, 0.2],
    ["vsi", -0.152, 0.2],
  ];
  const otherRound: [GaugeName, number, number, number][] = [
    ["tach", -0.388, 0.085, R],
    ["vor1", -0.035, 0.315, 0.036],
    ["vor2", -0.035, 0.2, 0.036],
    ["clock", -0.475, 0.315, 0.026],
  ];
  for (const [, x, y] of sixPack) {
    instrumentBezel(fittings, x, y, R);
  }
  for (const [, x, y, r] of otherRound) {
    instrumentBezel(fittings, x, y, r);
  }
  // Suction and ammeter: small static gauges under the clock.
  for (const y of [0.2, 0.12]) {
    instrumentBezel(fittings, -0.475, y, 0.022);
    fittings.cap(ringZ(-0.475, y, PANEL_Z + 0.003, 0.022, 20), 0x0b0b0c, [-0.475, y, PANEL_Z - 1]);
    fittings.box([-0.475, y + 0.006, PANEL_Z + 0.004], [0.002, 0.022, 0.001], 0xf2f2ee);
  }
  // Engine cluster and fuel gauges: rectangular housings.
  // Engine cluster and fuel gauges sit in flat housings; their faces are drawn on top.
  fittings.box([-0.215, 0.085, PANEL_Z + 0.004], [0.1, 0.1, 0.008], BEZEL);
  fittings.box([0.355, 0.315, PANEL_Z + 0.004], [0.1, 0.1, 0.008], BEZEL);
  // Annunciator strip above the six-pack.
  fittings.box([-0.27, 0.395, PANEL_Z + 0.004], [0.34, 0.026, 0.008], 0x0b0b0c);
  // Radio stack bay.
  fittings.box([0.13, 0.225, PANEL_Z + 0.002], [0.19, 0.36, 0.004], 0x0d0e0f);
  // Hobbs meter, ELT switch, and placards on the right.
  fittings.box([0.45, 0.315, PANEL_Z + 0.004], [0.05, 0.022, 0.006], 0x0b0b0c);
  fittings.box([0.45, 0.25, PANEL_Z + 0.006], [0.03, 0.03, 0.01], 0xb53228);
  placard(fittings, 0.355, 0.24, 0.1, 0.016);
  placard(fittings, 0.43, 0.19, 0.12, 0.03, 0xd9d6cc);
  // Glovebox with latch.
  fittings.box([0.38, 0.06, PANEL_Z + 0.004], [0.24, 0.11, 0.008], 0x34373c);
  fittings.box([0.38, 0.1, PANEL_Z + 0.01], [0.05, 0.012, 0.006], CHROME);
  // Circuit breaker panel.
  fittings.box([0.37, -0.03, PANEL_Z + 0.003], [0.27, 0.035, 0.004], 0x2a2c30);
  for (let i = 0; i < 11; i++) {
    const x = 0.25 + i * 0.024;
    fittings.loft([ringZ(x, -0.03, PANEL_Z + 0.003, 0.006, 8), ringZ(x, -0.03, PANEL_Z + 0.014, 0.0055, 8)], () => 0x0d0d0e);
  }
  // Rocker switches with the red master and alternator halves, legends above.
  placard(fittings, -0.355, 0.028, 0.29, 0.014);
  for (let i = 0; i < 9; i++) {
    const x = -0.48 + i * 0.031;
    fittings.box([x, -0.01, PANEL_Z + 0.004], [0.022, 0.04, 0.008], 0x0e0f10);
    fittings.box([x, i % 3 === 1 ? -0.003 : -0.017, PANEL_Z + 0.012], [0.016, 0.019, 0.01], i < 2 ? 0xc0392b : 0xebe9e3);
  }
  // Magneto and starter key.
  fittings.loft([ringZ(-0.475, 0.06, PANEL_Z, 0.017, 14), ringZ(-0.475, 0.06, PANEL_Z + 0.009, 0.015, 14)], () => CHROME);
  fittings.box([-0.475, 0.064, PANEL_Z + 0.02], [0.007, 0.03, 0.02], 0x1b1b1b);
  placard(fittings, -0.475, 0.09, 0.05, 0.01);
  // Wet compass hanging from the top of the windshield frame.
  // Wet compass sitting on the glareshield, with its mounting bracket beside it.
  fittings.box([0.1, top + 0.07, PANEL_Z - 0.12], [0.07, 0.055, 0.06], 0x15171b);
  fittings.box([0.1, top + 0.075, PANEL_Z - 0.0895], [0.05, 0.024, 0.002], 0xe9e3c8);
  fittings.box([0.1, top + 0.075, PANEL_Z - 0.0885], [0.0015, 0.03, 0.002], 0xc0392b);
  fittings.box([0.1, top + 0.04, PANEL_Z - 0.12], [0.04, 0.02, 0.05], 0x15171b);
  // Fresh-air vents in the wing roots.
  for (const side of [-1, 1]) {
    const vent = (y: number, r: number) => ringZ(0, 0, 0, r, 12).map(([x, z]): V3 => [side * 0.47 + x, y, -0.4 + z]);
    fittings.loft([vent(0.99, 0.02), vent(0.972, 0.018), vent(0.97, 0.009)], () => 0x8a8072);
  }
  // Throttle and mixture legends.
  placard(fittings, 0.027, -0.012, 0.09, 0.01);
  // Dome light and speaker grille.
  fittings.box([0, 1.0, 0.25], [0.12, 0.02, 0.07], 0xdedad0);
  fittings.box([0, 1.005, -0.25], [0.16, 0.012, 0.12], 0x2a2b2e);
  // Double-sided: the flat bezel frames have no inside point to orient them by.
  addMesh(root, fittings.build(crease), new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3, side: DoubleSide }));

  // ---- Live instrument faces ----
  const atlas = document.createElement("canvas");
  atlas.width = CELL * ATLAS_COLUMNS;
  atlas.height = CELL * ATLAS_ROWS;
  const ctx = atlas.getContext("2d");
  const atlasTexture = new CanvasTexture(atlas);
  atlasTexture.colorSpace = SRGBColorSpace;
  atlasTexture.anisotropy = 8;
  const faceMaterial = new MeshBasicMaterial({ map: atlasTexture, toneMapped: false });
  for (const [name, x, y] of sixPack) {
    const face = new Mesh(mapToCell(new CircleGeometry(R, 40), CELLS[name]), faceMaterial);
    face.position.set(x, y, PANEL_Z + 0.0025);
    root.add(face);
  }
  for (const [name, x, y, r] of otherRound) {
    const face = new Mesh(mapToCell(new CircleGeometry(r, 40), CELLS[name]), faceMaterial);
    face.position.set(x, y, PANEL_Z + 0.0025);
    root.add(face);
  }
  for (const [name, x, y] of [
    ["engine", -0.215, 0.085],
    ["fuel", 0.355, 0.315],
  ] as const) {
    const face = new Mesh(mapToCell(new PlaneGeometry(0.088, 0.088), CELLS[name]), faceMaterial);
    face.position.set(x, y, PANEL_Z + 0.0085);
    root.add(face);
  }

  // ---- Radio stack and annunciator (drawn once) ----
  const radios = document.createElement("canvas");
  radios.width = 256;
  radios.height = 480;
  drawRadios(radios);
  const radioTexture = new CanvasTexture(radios);
  radioTexture.colorSpace = SRGBColorSpace;
  radioTexture.anisotropy = 8;
  const radioFace = new Mesh(new PlaneGeometry(0.18, 0.34), new MeshBasicMaterial({ map: radioTexture, toneMapped: false }));
  radioFace.position.set(0.13, 0.225, PANEL_Z + 0.0045);
  root.add(radioFace);

  const annunciator = document.createElement("canvas");
  annunciator.width = 512;
  annunciator.height = 40;
  drawAnnunciator(annunciator);
  const annunciatorTexture = new CanvasTexture(annunciator);
  annunciatorTexture.colorSpace = SRGBColorSpace;
  const annunciatorFace = new Mesh(new PlaneGeometry(0.33, 0.022), new MeshBasicMaterial({ map: annunciatorTexture, toneMapped: false }));
  annunciatorFace.position.set(-0.27, 0.395, PANEL_Z + 0.0085);
  root.add(annunciatorFace);

  // ---- Engine controls: throttle, mixture; flap selector ----
  const knob = (color: number, radius: number, ribbed: boolean): Object3D => {
    const holder = new Object3D();
    const g = new MeshBuilder();
    g.beam([0, 0, -0.02], [0, 0, 0.1], 0.0045, 8, CHROME);
    const sides = ribbed ? 16 : 12;
    g.loft(
      [
        ringZ(0, 0, 0.095, radius * 0.75, sides),
        ringZ(0, 0, 0.1, radius, sides),
        ringZ(0, 0, 0.122, radius, sides),
        ringZ(0, 0, 0.128, radius * 0.7, sides),
      ],
      (ring, segment) => (ribbed && ring === 1 && segment % 2 === 0 ? 0x2a2a2a : color),
    );
    holder.add(new Mesh(g.build(crease), satin));
    return holder;
  };
  const throttle = knob(0x101010, 0.017, false);
  throttle.position.set(0.0, 0.02, PANEL_Z - 0.1);
  const mixture = knob(0xb02a20, 0.014, true);
  mixture.position.set(0.055, 0.02, PANEL_Z - 0.1);
  root.add(throttle, mixture);

  const flapLever = new Object3D();
  const flapGeo = new MeshBuilder();
  flapGeo.box([0, 0, 0.014], [0.006, 0.006, 0.024], CHROME);
  // The flap handle is shaped like a little wing.
  flapGeo.box([0, 0, 0.032], [0.034, 0.014, 0.012], 0xefede6);
  flapLever.add(new Mesh(flapGeo.build(), satin));
  flapLever.position.set(0.255, 0.05, PANEL_Z);
  root.add(flapLever);
  const flapGate = new MeshBuilder();
  flapGate.box([0.255, 0.02, PANEL_Z + 0.003], [0.01, 0.08, 0.004], 0x050505);
  for (let i = 0; i < 4; i++) {
    flapGate.box([0.276, 0.05 - i * 0.02, PANEL_Z + 0.003], [0.014, 0.0025, 0.002], 0xf4f4f0);
  }
  addMesh(root, flapGate.build(), matte);

  // ---- Centre pedestal: trim wheel and indicator, fuel selector on the floor ----
  const pedestal = new MeshBuilder();
  pedestal.box([0, (FLOOR_Y + bottom) / 2 - 0.05, PANEL_Z + 0.12], [0.15, bottom - FLOOR_Y - 0.1, 0.24], 0x2b2d31);
  pedestal.box([0.035, -0.165, PANEL_Z + 0.242], [0.02, 0.12, 0.004], 0x0b0b0c);
  pedestal.box([0.035, -0.15, PANEL_Z + 0.245], [0.016, 0.006, 0.004], 0xf4f4f0);
  pedestal.box([0, FLOOR_Y + 0.02, -0.38], [0.2, 0.02, 0.2], 0x2b2d31);
  pedestal.cap(ringZ(0, 0, 0, 0.07, 16).map(([x, y]): V3 => [x, FLOOR_Y + 0.031, -0.38 + y]), 0x1d1e20, [0, FLOOR_Y, -0.38]);
  pedestal.box([0, FLOOR_Y + 0.05, -0.38], [0.02, 0.04, 0.11], 0xd1b84a);
  addMesh(root, pedestal.build(), matte);

  const trimWheel = new Object3D();
  const trimGeo = new MeshBuilder();
  trimGeo.loft(
    [
      [-0.013, 0.07],
      [-0.013, 0.08],
      [0.013, 0.08],
      [0.013, 0.07],
    ].map(([x, r]) =>
      Array.from({ length: 20 }, (_, k): V3 => {
        const t = (k / 20) * Math.PI * 2;
        return [x ?? 0, Math.cos(t) * (r ?? 0), Math.sin(t) * (r ?? 0)];
      }),
    ),
    (_ring, segment) => (segment % 2 === 0 ? 0x1a1a1a : 0x2b2b2b),
  );
  trimWheel.add(new Mesh(trimGeo.build(), matte));
  trimWheel.position.set(-0.03, -0.12, PANEL_Z + 0.2);
  root.add(trimWheel);

  // ---- Yokes ----
  const yokes: Object3D[] = [];
  for (const x of [-0.27, 0.27]) {
    const collar = new MeshBuilder();
    collar.loft([ringZ(x, 0.13, PANEL_Z - 0.02, 0.028, 14), ringZ(x, 0.13, PANEL_Z + 0.012, 0.028, 14), ringZ(x, 0.13, PANEL_Z + 0.016, 0.018, 14)], () => BEZEL);
    addMesh(root, collar.build(crease), matte);

    const yoke = new Object3D();
    const g = new MeshBuilder();
    g.beam([0, 0, -0.42], [0, 0, -0.02], 0.011, 10, CHROME);
    // Hub with a pale centre plate, then the ram's-horn grips.
    g.loft([ringZ(0, 0, -0.03, 0.022, 14), ringZ(0, 0.004, 0.0, 0.034, 14), ringZ(0, 0.004, 0.018, 0.03, 14)], () => 0x121212);
    g.cap(ringZ(0, 0.004, 0.0185, 0.024, 14), 0xd9d6ce, [0, 0, 0]);
    const grip: V3[] = [
      [0.025, 0.0, 0.006],
      [0.08, -0.012, 0.01],
      [0.118, 0.0, 0.01],
      [0.135, 0.04, 0.008],
      [0.138, 0.085, 0.004],
      [0.128, 0.115, 0.0],
    ];
    for (const side of [-1, 1]) {
      for (let k = 0; k + 1 < grip.length; k++) {
        const a = grip[k];
        const b = grip[k + 1];
        if (a && b) {
          const radius = k >= 2 ? 0.017 : 0.013;
          g.beam([side * a[0], a[1], a[2]], [side * b[0], b[1], b[2]], radius, 10, 0x141414, k >= 2 ? 0.017 : radius);
        }
      }
    }
    // Push-to-talk and trim switches on the left horn.
    g.box([-0.13, 0.07, 0.022], [0.012, 0.012, 0.008], 0xb02a20);
    yoke.add(new Mesh(g.build(crease), satin));
    yoke.position.set(x, 0.13, PANEL_Z + 0.26);
    root.add(yoke);
    yokes.push(yoke);
  }

  // ---- Rudder pedals with toe brakes ----
  const pedals: Object3D[] = [];
  for (const seatX of [-0.27, 0.27]) {
    for (const side of [-1, 1]) {
      const pedal = new Object3D();
      const p = new MeshBuilder();
      p.beam([0, 0.13, -0.05], [0, 0.0, 0.0], 0.007, 6, CHROME);
      p.box([0, 0.0, 0.0], [0.075, 0.12, 0.014], 0x1c1d1f);
      for (let k = 0; k < 4; k++) {
        p.box([0, -0.04 + k * 0.025, 0.009], [0.07, 0.006, 0.004], 0x55585d);
      }
      pedal.add(new Mesh(p.build(), satin));
      pedal.rotation.x = -0.55;
      pedal.position.set(seatX + side * 0.085, FLOOR_Y + 0.1, -0.93);
      root.add(pedal);
      pedals.push(pedal);
    }
  }

  // ---- Seats, floor, and the rear bench ----
  const seats = new MeshBuilder();
  for (const x of [-0.27, 0.27]) {
    // Cushion with a rolled front edge.
    seats.loft(
      [
        [0.24, 0.0],
        [0.26, 0.05],
        [0.24, 0.07],
      ].map(([z, y]) => roundedSquare(0, 0, 0, 0.22, 0.05).map(([px, pz]): V3 => [x + px, FLOOR_Y + 0.22 + (y ?? 0), -0.02 + pz * ((z ?? 0) / 0.22)])),
      () => LEATHER,
    );
    seats.box([x, FLOOR_Y + 0.29, 0.0], [0.38, 0.02, 0.36], LEATHER_DARK);
    // Backrest with inserts and a headrest.
    seats.box([x, FLOOR_Y + 0.62, 0.3], [0.44, 0.66, 0.1], LEATHER);
    seats.box([x, FLOOR_Y + 0.62, 0.247], [0.3, 0.56, 0.01], LEATHER_DARK);
    for (let k = 0; k < 5; k++) {
      seats.box([x, FLOOR_Y + 0.4 + k * 0.1, 0.24], [0.3, 0.008, 0.004], 0x4a463f);
    }
    seats.box([x, FLOOR_Y + 1.03, 0.31], [0.24, 0.14, 0.08], LEATHER);
    // Seat rails and frame.
    for (const dx of [-0.15, 0.15]) {
      seats.box([x + dx, FLOOR_Y + 0.1, 0.0], [0.03, 0.2, 0.42], 0x333333);
      seats.box([x + dx, FLOOR_Y + 0.012, -0.05], [0.02, 0.02, 0.8], 0x777a7e);
    }
    // Lap belt and shoulder harness lying on the seat.
    seats.box([x - 0.1, FLOOR_Y + 0.3, 0.05], [0.04, 0.006, 0.36], 0x3c4048);
    seats.box([x + 0.08, FLOOR_Y + 0.66, 0.243], [0.045, 0.6, 0.006], 0x3c4048);
  }
  seats.box([0, FLOOR_Y + 0.22, 1.02], [1.0, 0.12, 0.46], LEATHER);
  seats.box([0, FLOOR_Y + 0.6, 1.26], [1.0, 0.64, 0.1], LEATHER);
  seats.box([0, FLOOR_Y - 0.01, -0.15], [1.06, 0.03, 2.4], CARPET);
  // Firewall kick panel under the panel.
  seats.quad([-0.53, FLOOR_Y, -0.82], [0.53, FLOOR_Y, -0.82], [0.53, -0.2, -0.93], [-0.53, -0.2, -0.93], 0x3a3832, [0, 0, -0.5]);
  addMesh(root, seats.build(crease), soft);

  // ---- Door trim: armrests, handles, map pockets ----
  const doors = new MeshBuilder();
  for (const side of [-1, 1]) {
    const x = side * 0.5;
    doors.box([x, 0.13, -0.02], [0.06, 0.05, 0.46], 0xb3a68f);
    doors.box([side * 0.505, 0.3, -0.28], [0.03, 0.025, 0.12], CHROME);
    doors.box([side * 0.52, -0.08, -0.1], [0.02, 0.16, 0.4], 0xa39782);
    doors.box([side * 0.49, 0.22, 0.36], [0.03, 0.04, 0.05], 0xb3a68f);
  }
  addMesh(root, doors.build(crease), soft);

  let lastDraw = -1;

  return {
    root,
    update(state) {
      const now = performance.now();
      if (ctx && now - lastDraw > 33) {
        lastDraw = now;
        drawGauges(ctx, state);
        atlasTexture.needsUpdate = true;
      }
      const pull = Math.max(-1, Math.min(1, state.elevator));
      for (const yoke of yokes) {
        yoke.position.z = PANEL_Z + 0.26 + pull * 0.09;
        yoke.rotation.z = -state.aileron * 0.8;
      }
      throttle.position.z = PANEL_Z - 0.1 + (1 - state.throttle) * 0.06;
      flapLever.position.y = 0.05 - (state.flapNotch / 3) * 0.06;
      trimWheel.rotation.x = -pull * 0.6;
      pedals.forEach((pedal, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        pedal.position.z = -0.93 - side * state.rudder * 0.05;
        pedal.rotation.x = -0.55 - state.brake * 0.25;
      });
    },
  };
}

/**
 * The cabin's inner shell, built from the fuselage stations: headliner,
 * sidewalls, and darker trim around every window opening. Rendered from the
 * inside (back faces), so it never shows from outside the aircraft.
 */
export function cabinLining(rings: readonly (readonly V3[])[], isWindow: (band: number, segment: number) => boolean, fromBand: number, toBand: number): Mesh {
  const lining = new MeshBuilder();
  const inset = (p: V3): V3 => [p[0] * 0.955, p[1] * 0.975 + 0.008, p[2]];
  for (let band = fromBand; band < toBand; band++) {
    const a = rings[band];
    const b = rings[band + 1];
    if (!a || !b) {
      continue;
    }
    const inside: V3 = [0, 0.3, (( a[0]?.[2] ?? 0) + (b[0]?.[2] ?? 0)) / 2];
    for (let i = 0; i < a.length; i++) {
      if (isWindow(band, i)) {
        continue;
      }
      const j = (i + 1) % a.length;
      const [a0, a1, b0, b1] = [a[i], a[j], b[i], b[j]];
      if (!a0 || !a1 || !b0 || !b1) {
        continue;
      }
      const prev = (i - 1 + a.length) % a.length;
      const next = j;
      const y = (a0[1] + a1[1]) / 2;
      // Dark trim on the slim pillars between windows and along each opening's edges.
      const pillar = (band === 6 || band === 8) && y > 0.3;
      const nearWindow = pillar || isWindow(band, prev) || isWindow(band, next);
      // Forward of the doors the walls are dark like the panel sides; behind, light upholstery.
      const forward = band <= 5;
      // Ahead of the A-pillar everything reads as part of the dark glareshield.
      const color = forward && !pillar ? GLARESHIELD : nearWindow ? 0xbcae96 : y > 0.95 ? 0xd8cdb9 : y > 0.35 ? 0xcabda6 : 0x9d927f;
      lining.quad(inset(a0), inset(a1), inset(b1), inset(b0), color, inside);
    }
  }
  const mesh = new Mesh(lining.build(30), new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: BackSide }));
  mesh.name = "cabin-lining";
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Instrument drawing
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

function cellOrigin(ctx: CanvasRenderingContext2D, name: GaugeName): void {
  const [column, row] = CELLS[name];
  ctx.setTransform(1, 0, 0, 1, column * CELL + CELL / 2, row * CELL + CELL / 2);
}

function dial(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#0b0c0d";
  ctx.beginPath();
  ctx.arc(0, 0, 127, 0, Math.PI * 2);
  ctx.fill();
}

function ticks(ctx: CanvasRenderingContext2D, from: number, to: number, count: number, length: number, width: number, radius = 116): void {
  ctx.strokeStyle = "#f2f2ee";
  ctx.lineWidth = width;
  for (let i = 0; i <= count; i++) {
    const a = (from + ((to - from) * i) / count) * DEG;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
    ctx.lineTo(Math.cos(a) * (radius - length), Math.sin(a) * (radius - length));
    ctx.stroke();
  }
}

function arcBand(ctx: CanvasRenderingContext2D, from: number, to: number, color: string, radius = 112, width = 9): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(0, 0, radius, from * DEG, to * DEG);
  ctx.stroke();
}

function needle(ctx: CanvasRenderingContext2D, angleDeg: number, length: number, width: number, color = "#f4f4f0"): void {
  ctx.save();
  ctx.rotate(angleDeg * DEG);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-18, -width);
  ctx.lineTo(length - 14, -width * 0.6);
  ctx.lineTo(length, 0);
  ctx.lineTo(length - 14, width * 0.6);
  ctx.lineTo(-18, width);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = "#f2f2ee"): void {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

function numbersAround(ctx: CanvasRenderingContext2D, values: readonly (string | number)[], angle: (i: number) => number, radius: number, size: number): void {
  values.forEach((value, i) => {
    const a = angle(i) * DEG;
    label(ctx, String(value), Math.cos(a) * radius, Math.sin(a) * radius, size);
  });
}

function drawGauges(ctx: CanvasRenderingContext2D, s: InstrumentState): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, CELL * ATLAS_COLUMNS, CELL * ATLAS_ROWS);

  // Airspeed: 0–200 kt over 330°, with the POH colour arcs.
  cellOrigin(ctx, "asi");
  dial(ctx);
  const asiAngle = (kt: number) => -90 + (Math.min(200, Math.max(0, kt)) / 200) * 330;
  arcBand(ctx, asiAngle(40), asiAngle(85), "#f2f2ee", 104, 7);
  arcBand(ctx, asiAngle(48), asiAngle(129), "#2fbf4f");
  arcBand(ctx, asiAngle(129), asiAngle(163), "#f2c12e");
  ticks(ctx, asiAngle(162.5), asiAngle(163.5), 1, 24, 6);
  ticks(ctx, asiAngle(40), asiAngle(200), 32, 12, 2);
  ticks(ctx, asiAngle(40), asiAngle(200), 8, 20, 4);
  numbersAround(ctx, [40, 60, 80, 100, 120, 140, 160, 180], (i) => asiAngle(40 + i * 20), 82, 22);
  label(ctx, "KNOTS", 0, 40, 15, "#bbb");
  needle(ctx, asiAngle(s.airspeedKt), 104, 6);

  // Attitude indicator.
  cellOrigin(ctx, "ai");
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, 127, 0, Math.PI * 2);
  ctx.clip();
  ctx.rotate(-s.bankDeg * DEG);
  const pitchPx = 3.2;
  ctx.translate(0, Math.max(-60, Math.min(60, s.pitchDeg)) * pitchPx);
  ctx.fillStyle = "#3d86d6";
  ctx.fillRect(-300, -600, 600, 600);
  ctx.fillStyle = "#8a5a2b";
  ctx.fillRect(-300, 0, 600, 600);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-300, 0);
  ctx.lineTo(300, 0);
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let p = -30; p <= 30; p += 5) {
    if (p === 0) {
      continue;
    }
    const half = p % 10 === 0 ? 34 : 16;
    ctx.beginPath();
    ctx.moveTo(-half, -p * pitchPx);
    ctx.lineTo(half, -p * pitchPx);
    ctx.stroke();
    if (p % 10 === 0) {
      label(ctx, String(Math.abs(p)), -half - 14, -p * pitchPx, 13);
    }
  }
  ctx.restore();
  // Bank scale (fixed) and pointer (rotates with the card).
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  for (const b of [-60, -30, -20, -10, 10, 20, 30, 60]) {
    const a = (-90 + b) * DEG;
    const inner = Math.abs(b) === 30 || Math.abs(b) === 60 ? 96 : 104;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 116, Math.sin(a) * 116);
    ctx.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, -104);
  ctx.lineTo(-8, -118);
  ctx.lineTo(8, -118);
  ctx.fill();
  ctx.save();
  ctx.rotate(-s.bankDeg * DEG);
  ctx.fillStyle = "#f2a51e";
  ctx.beginPath();
  ctx.moveTo(0, -102);
  ctx.lineTo(-8, -88);
  ctx.lineTo(8, -88);
  ctx.fill();
  ctx.restore();
  // Miniature aircraft.
  ctx.strokeStyle = "#f2a51e";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-70, 0);
  ctx.lineTo(-24, 0);
  ctx.lineTo(-12, 12);
  ctx.moveTo(70, 0);
  ctx.lineTo(24, 0);
  ctx.lineTo(12, 12);
  ctx.stroke();
  ctx.fillStyle = "#f2a51e";
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();

  // Altimeter: long hand 1,000 ft per turn, short hand 10,000 ft.
  cellOrigin(ctx, "alt");
  dial(ctx);
  ticks(ctx, -90, 270, 50, 10, 2);
  ticks(ctx, -90, 270, 10, 20, 4);
  numbersAround(ctx, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], (i) => -90 + i * 36, 86, 26);
  ctx.fillStyle = "#1c1c1c";
  ctx.fillRect(34, -12, 48, 24);
  label(ctx, "29.92", 58, 0, 14);
  label(ctx, "ALT", 0, -40, 14, "#bbb");
  const alt = Math.max(0, s.altitudeFt);
  needle(ctx, -90 + ((alt / 10_000) % 1) * 360, 62, 8);
  needle(ctx, -90 + ((alt / 1_000) % 1) * 360, 108, 5);

  // Turn coordinator.
  cellOrigin(ctx, "tc");
  dial(ctx);
  ctx.strokeStyle = "#f2f2ee";
  ctx.lineWidth = 4;
  for (const a of [0, 20, 160, 180, 200]) {
    if (a === 20 || a === 160) {
      const rad = a * DEG;
      ctx.beginPath();
      ctx.moveTo(Math.cos(rad) * 112, Math.sin(rad) * 112);
      ctx.lineTo(Math.cos(rad) * 92, Math.sin(rad) * 92);
      ctx.stroke();
    }
  }
  label(ctx, "L", -96, 46, 16);
  label(ctx, "R", 96, 46, 16);
  label(ctx, "2 MIN", 0, 96, 13, "#bbb");
  ctx.save();
  // Standard rate (3°/s) puts the wing on the marks at 20°.
  ctx.rotate(Math.max(-40, Math.min(40, (s.turnRateDeg / 3) * 20)) * DEG);
  ctx.strokeStyle = "#f2f2ee";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-84, 0);
  ctx.lineTo(84, 0);
  ctx.moveTo(0, -18);
  ctx.lineTo(0, 6);
  ctx.moveTo(-14, -26);
  ctx.lineTo(14, -26);
  ctx.stroke();
  ctx.fillStyle = "#f2f2ee";
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Inclinometer tube and ball.
  ctx.strokeStyle = "#cfcfcf";
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.arc(0, -40, 110, 60 * DEG, 120 * DEG);
  ctx.stroke();
  const ball = Math.max(-26, Math.min(26, s.slip * 160));
  ctx.fillStyle = "#101010";
  ctx.beginPath();
  ctx.arc(Math.sin(ball * DEG) * 110, -40 + Math.cos(ball * DEG) * 110, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#101010";
  ctx.lineWidth = 2;
  for (const x of [-12, 12]) {
    ctx.beginPath();
    ctx.moveTo(x, 58);
    ctx.lineTo(x, 80);
    ctx.stroke();
  }

  // Heading indicator: a rotating card under a fixed lubber line.
  cellOrigin(ctx, "hi");
  dial(ctx);
  ctx.save();
  ctx.rotate(-s.headingDeg * DEG);
  ticks(ctx, -90, 270, 72, 10, 2);
  ticks(ctx, -90, 270, 36, 18, 3);
  const cardinal = ["N", "3", "6", "E", "12", "15", "S", "21", "24", "W", "30", "33"];
  cardinal.forEach((text, i) => {
    ctx.save();
    ctx.rotate(i * 30 * DEG);
    label(ctx, text, 0, -80, text.length === 1 && "NESW".includes(text) ? 28 : 22);
    ctx.restore();
  });
  ctx.restore();
  ctx.strokeStyle = "#f2a51e";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, -126);
  ctx.lineTo(0, -100);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(0, 34);
  ctx.moveTo(-34, 0);
  ctx.lineTo(34, 0);
  ctx.moveTo(-14, 26);
  ctx.lineTo(14, 26);
  ctx.stroke();

  // Vertical speed: 0 at nine o'clock, ±2,000 fpm.
  cellOrigin(ctx, "vsi");
  dial(ctx);
  const vsiAngle = (fpm: number) => 180 + (Math.max(-2000, Math.min(2000, fpm)) / 2000) * 170;
  ticks(ctx, vsiAngle(-2000), vsiAngle(2000), 40, 10, 2);
  ticks(ctx, vsiAngle(-2000), vsiAngle(2000), 8, 20, 4);
  numbersAround(ctx, [20, 15, 10, 5, 0, 5, 10, 15, 20], (i) => vsiAngle(-2000 + i * 500), 84, 20);
  label(ctx, "UP", 30, -40, 14, "#bbb");
  label(ctx, "DN", 30, 40, 14, "#bbb");
  needle(ctx, vsiAngle(s.verticalSpeedFpm), 104, 5);

  // Tachometer.
  cellOrigin(ctx, "tach");
  dial(ctx);
  const tachAngle = (rpm: number) => -225 + (Math.max(0, Math.min(3500, rpm)) / 3500) * 270;
  arcBand(ctx, tachAngle(2100), tachAngle(2700), "#2fbf4f");
  ticks(ctx, tachAngle(2695), tachAngle(2705), 1, 24, 6);
  ctx.strokeStyle = "#e0342a";
  ticks(ctx, tachAngle(0), tachAngle(3500), 35, 10, 2);
  ticks(ctx, tachAngle(0), tachAngle(3500), 7, 20, 4);
  numbersAround(ctx, [0, 5, 10, 15, 20, 25, 30, 35], (i) => tachAngle(i * 500), 82, 20);
  label(ctx, "RPM", 0, 40, 15, "#bbb");
  label(ctx, "×100", 0, 60, 12, "#bbb");
  ctx.fillStyle = "#1c1c1c";
  ctx.fillRect(-30, 74, 60, 20);
  label(ctx, "1847.3", 0, 84, 13);
  needle(ctx, tachAngle(s.rpm), 104, 5);

  // Engine cluster: fuel quantity, oil temperature and pressure, EGT.
  cellOrigin(ctx, "engine");
  dial(ctx);
  const bars: [string, number][] = [
    ["FUEL L", 0.7],
    ["FUEL R", 0.68],
    ["OIL °F", 0.45 + s.throttle * 0.2],
    ["OIL PSI", 0.55 + (s.rpm / 2700) * 0.25],
    ["EGT", 0.35 + s.throttle * 0.45],
  ];
  bars.forEach(([name, value], i) => {
    const y = -72 + i * 36;
    label(ctx, name, -54, y, 13, "#bbb");
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(-14, y - 6, 92, 12);
    ctx.fillStyle = "#2fbf4f";
    ctx.fillRect(10, y - 6, 54, 12);
    ctx.fillStyle = "#f4f4f0";
    ctx.fillRect(-14 + Math.max(0, Math.min(1, value)) * 92 - 2, y - 10, 4, 20);
  });

  // VOR heads: nothing tuned, so the needles rest centred with the red OFF flag showing.
  for (const [name, obs] of [
    ["vor1", 251],
    ["vor2", 70],
  ] as const) {
    cellOrigin(ctx, name);
    dial(ctx);
    ctx.save();
    ctx.rotate(-obs * DEG);
    ticks(ctx, -90, 270, 36, 12, 3);
    ["N", "3", "6", "E", "12", "15", "S", "21", "24", "W", "30", "33"].forEach((text, i) => {
      ctx.save();
      ctx.rotate(i * 30 * DEG);
      label(ctx, text, 0, -86, 20);
      ctx.restore();
    });
    ctx.restore();
    ctx.strokeStyle = "#f4f4f0";
    ctx.lineWidth = 2;
    for (let k = -4; k <= 4; k++) {
      if (k !== 0) {
        ctx.beginPath();
        ctx.arc(k * 14, 0, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "#f2a51e";
    ctx.fillRect(-2, -66, 4, 132);
    ctx.fillRect(-60, -2, 120, 4);
    ctx.fillStyle = "#c62c22";
    ctx.fillRect(28, 22, 34, 18);
    label(ctx, "OFF", 45, 31, 12);
    ctx.fillStyle = "#f2a51e";
    ctx.beginPath();
    ctx.moveTo(0, -122);
    ctx.lineTo(-8, -108);
    ctx.lineTo(8, -108);
    ctx.fill();
  }

  // Clock: the real local time.
  cellOrigin(ctx, "clock");
  dial(ctx);
  ticks(ctx, -90, 270, 60, 8, 2);
  ticks(ctx, -90, 270, 12, 18, 5);
  numbersAround(ctx, [12, 3, 6, 9], (i) => -90 + i * 90, 84, 26);
  const time = new Date();
  const seconds = time.getSeconds() + time.getMilliseconds() / 1000;
  const minutes = time.getMinutes() + seconds / 60;
  needle(ctx, -90 + ((time.getHours() % 12) + minutes / 60) * 30, 66, 7);
  needle(ctx, -90 + minutes * 6, 104, 5);
  needle(ctx, -90 + seconds * 6, 110, 2, "#e0342a");

  // Fuel quantity: left and right tanks side by side.
  cellOrigin(ctx, "fuel");
  ctx.fillStyle = "#0b0c0d";
  ctx.fillRect(-128, -128, 256, 256);
  for (const [side, level, name] of [
    [-1, 0.72, "L"],
    [1, 0.7, "R"],
  ] as const) {
    ctx.save();
    ctx.translate(side * 62, 20);
    const angle = (f: number) => -150 + f * 120;
    arcBand(ctx, angle(0), angle(0.12), "#e0342a", 74, 8);
    ticks(ctx, angle(0), angle(1), 4, 16, 3, 82);
    label(ctx, "E", Math.cos(angle(0) * DEG) * 54, Math.sin(angle(0) * DEG) * 54, 16);
    label(ctx, "F", Math.cos(angle(1) * DEG) * 54, Math.sin(angle(1) * DEG) * 54, 16);
    label(ctx, name, 0, 34, 18, "#bbb");
    needle(ctx, angle(level), 72, 4);
    ctx.restore();
  }
  label(ctx, "FUEL QTY · GAL", 0, -96, 15, "#bbb");

  // A faint reflection across every glass face.
  for (const name of Object.keys(CELLS) as GaugeName[]) {
    cellOrigin(ctx, name);
    const sheen = ctx.createLinearGradient(-90, -110, 40, 40);
    sheen.addColorStop(0, "rgba(255,255,255,0.10)");
    sheen.addColorStop(0.45, "rgba(255,255,255,0.03)");
    sheen.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.arc(0, 0, 127, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawAnnunciator(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const labels = ["OIL PRESS", "LOW VAC", "VOLTS", "L FUEL", "R FUEL"];
  const width = canvas.width / labels.length;
  labels.forEach((text, i) => {
    ctx.fillStyle = "#1c1d1f";
    ctx.fillRect(i * width + 4, 4, width - 8, canvas.height - 8);
    ctx.fillStyle = "#6b5a2a";
    ctx.font = "700 15px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, i * width + width / 2, canvas.height / 2 + 1);
  });
}

function drawRadios(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.fillStyle = "#121314";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(1, canvas.height / 384);
  const unit = (y: number, h: number, draw: () => void) => {
    ctx.fillStyle = "#1d1e20";
    ctx.fillRect(6, y + 3, canvas.width - 12, h - 6);
    ctx.strokeStyle = "#2c2d30";
    ctx.lineWidth = 2;
    ctx.strokeRect(6, y + 3, canvas.width - 12, h - 6);
    draw();
  };
  const knob = (x: number, y: number) => {
    ctx.fillStyle = "#3a3b3e";
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
  };
  const text = (value: string, x: number, y: number, color: string, size: number) => {
    ctx.fillStyle = color;
    ctx.font = `600 ${size}px "Courier New", monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(value, x, y);
  };
  // Audio panel.
  unit(0, 46, () => {
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = i === 1 || i === 4 ? "#5fbf6a" : "#3a3b3e";
      ctx.fillRect(14 + i * 26, 14, 20, 16);
    }
  });
  // GPS / NAV / COM with a moving-map screen.
  unit(46, 140, () => {
    ctx.fillStyle = "#050607";
    ctx.fillRect(16, 58, 170, 116);
    text("COM 121.300", 22, 72, "#4fdc6a", 16);
    text("    118.700", 22, 90, "#c8c8c8", 16);
    text("VLOC 110.50", 22, 112, "#4fdc6a", 16);
    ctx.fillStyle = "#1a3d6b";
    ctx.fillRect(22, 124, 158, 44);
    ctx.strokeStyle = "#e6e6e6";
    ctx.beginPath();
    ctx.moveTo(40, 160);
    ctx.lineTo(160, 132);
    ctx.stroke();
    knob(214, 80);
    knob(214, 150);
  });
  // COM2.
  unit(186, 50, () => {
    ctx.fillStyle = "#050607";
    ctx.fillRect(16, 196, 170, 30);
    text("122.800  125.250", 22, 211, "#f2a51e", 15);
    knob(214, 211);
  });
  // Transponder.
  unit(236, 50, () => {
    ctx.fillStyle = "#050607";
    ctx.fillRect(16, 246, 170, 30);
    text("ALT  1200  FL030", 22, 261, "#f2a51e", 15);
    knob(214, 261);
  });
  // Autopilot.
  unit(286, 50, () => {
    ctx.fillStyle = "#050607";
    ctx.fillRect(16, 296, 120, 30);
    text("AP  HDG ALT", 22, 311, "#4fdc6a", 14);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = "#3a3b3e";
      ctx.fillRect(146 + i * 26, 300, 20, 22);
    }
  });
  // ELT and placard.
  unit(336, 48, () => {
    text("ELT  ARM", 22, 360, "#c8c8c8", 13);
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(160, 350, 30, 20);
  });
}
