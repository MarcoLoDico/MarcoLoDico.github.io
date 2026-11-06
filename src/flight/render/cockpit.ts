import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
  type BufferAttribute,
  type BufferGeometry,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * The C172S cabin. Its geometry is modelled in Blender (blender/build_cabin.py
 * → public/models/c172-cabin.glb); this module loads it, paints the live
 * instrument faces onto the named gauge meshes, and moves the controls.
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
  readonly root: Object3D;
  /** The seated pilot, hidden when you're the one in the seat. */
  readonly pilot: Object3D | null;
  update(state: InstrumentState): void;
}

const CABIN_URL = `${import.meta.env.BASE_URL}models/c172-cabin.glb`;

// The panel decal sheet spans the panel face (see build_cabin.py): x ±0.5 m,
// y from -0.06 m to 0.46 m. Placards are placed in those panel coordinates.
const DECAL = { left: -0.5, right: 0.5, bottom: -0.06, top: 0.46, pxPerMeter: 2048 };

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

function isGaugeName(name: string): name is GaugeName {
  return name in CELLS;
}

/**
 * Points a face's 0..1 texture coordinates at part of a canvas. Blender's
 * exporter writes glTF's top-left UV origin; canvas textures use bottom-left.
 */
function remapUv(geometry: BufferGeometry, column = 0, row = 0, columns = 1, rows = 1): void {
  const uv = geometry.getAttribute("uv") as BufferAttribute | undefined;
  if (!uv) {
    return;
  }
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = 1 - uv.getY(i);
    uv.setXY(i, (column + u) / columns, 1 - (row + 1) / rows + v / rows);
  }
  uv.needsUpdate = true;
}

function canvasTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Loads the cabin model and wires up its instruments and controls. */
export async function loadCockpit(): Promise<Cockpit> {
  const gltf = await new GLTFLoader().loadAsync(CABIN_URL);
  const root = gltf.scene;
  root.name = "cabin";

  // Live gauge faces share one canvas atlas, redrawn ~30 times a second.
  const atlas = document.createElement("canvas");
  atlas.width = CELL * ATLAS_COLUMNS;
  atlas.height = CELL * ATLAS_ROWS;
  const ctx = atlas.getContext("2d");
  const atlasTexture = canvasTexture(atlas);
  const faceMaterial = new MeshBasicMaterial({ map: atlasTexture, toneMapped: false });

  const radios = document.createElement("canvas");
  radios.width = 256;
  radios.height = 480;
  drawRadios(radios);
  const annunciator = document.createElement("canvas");
  annunciator.width = 512;
  annunciator.height = 40;
  drawAnnunciator(annunciator);
  const decals = document.createElement("canvas");
  decals.width = Math.round((DECAL.right - DECAL.left) * DECAL.pxPerMeter);
  decals.height = Math.round((DECAL.top - DECAL.bottom) * DECAL.pxPerMeter);
  drawPlacards(decals);
  const compass = document.createElement("canvas");
  compass.width = 256;
  compass.height = 112;
  const compassCtx = compass.getContext("2d");
  const compassTexture = canvasTexture(compass);

  const nodes = new Map<string, Object3D>();
  root.traverse((object) => {
    nodes.set(object.name, object);
    if (!(object instanceof Mesh)) {
      return;
    }
    const geometry = object.geometry as BufferGeometry;
    object.receiveShadow = true;
    object.castShadow = false;
    if (object.name.startsWith("gauge_") && object.name !== "gauge_glass") {
      const name = object.name.slice("gauge_".length);
      if (isGaugeName(name)) {
        const [column, row] = CELLS[name];
        remapUv(geometry, column, row, ATLAS_COLUMNS, ATLAS_ROWS);
        object.material = faceMaterial;
      }
    } else if (object.name === "radios") {
      remapUv(geometry);
      object.material = new MeshBasicMaterial({ map: canvasTexture(radios), toneMapped: false });
    } else if (object.name === "annunciator") {
      remapUv(geometry);
      object.material = new MeshBasicMaterial({ map: canvasTexture(annunciator), toneMapped: false });
    } else if (object.name === "panel_decals") {
      // Lit like the panel, so the engraved-looking text shades with it.
      remapUv(geometry);
      object.material = new MeshStandardMaterial({ map: canvasTexture(decals), transparent: true, roughness: 0.75, depthWrite: false });
      object.renderOrder = 1;
    } else if (object.name === "gauge_glass") {
      // Almost invisible, but it catches reflections like real instrument glass.
      object.material = new MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.08,
        roughness: 0.04,
        metalness: 0.1,
        envMapIntensity: 2.2,
        depthWrite: false,
        side: DoubleSide,
      });
      object.renderOrder = 2;
    } else if (object.name === "compass_card") {
      remapUv(geometry);
      object.material = new MeshBasicMaterial({ map: compassTexture, toneMapped: false });
    }
  });

  // Moving parts keep their modelled rest pose; updates are offsets from it.
  const rest = (name: string) => {
    const node = nodes.get(name);
    return node ? { node, position: node.position.clone(), rotationX: node.rotation.x } : null;
  };
  const yokes = [rest("yoke_left"), rest("yoke_right")];
  const throttle = rest("throttle");
  const mixture = rest("mixture");
  const flapLever = rest("flap_lever");
  const trimWheel = rest("trim_wheel");
  const pedals = (["left", "right"] as const).flatMap((seat) =>
    (["l", "r"] as const).map((side) => ({ part: rest(`pedal_${seat}_${side}`), side: side === "l" ? -1 : 1 })),
  );
  const offset = new Vector3();

  let lastDraw = -1;
  return {
    root,
    pilot: nodes.get("pilot") ?? null,
    update(state) {
      const now = performance.now();
      if (ctx && now - lastDraw > 33) {
        lastDraw = now;
        drawGauges(ctx, state);
        atlasTexture.needsUpdate = true;
        if (compassCtx) {
          drawCompassCard(compassCtx, state.headingDeg);
          compassTexture.needsUpdate = true;
        }
      }
      const pull = Math.max(-1, Math.min(1, state.elevator));
      for (const yoke of yokes) {
        if (yoke) {
          yoke.node.position.copy(yoke.position).add(offset.set(0, 0, pull * 0.09));
          yoke.node.rotation.z = -state.aileron * 0.8;
        }
      }
      if (throttle) {
        // Pushed in for full power, pulled toward you at idle.
        throttle.node.position.copy(throttle.position).add(offset.set(0, 0, (1 - state.throttle) * 0.06));
      }
      if (mixture) {
        mixture.node.position.copy(mixture.position);
      }
      if (flapLever) {
        flapLever.node.position.copy(flapLever.position).add(offset.set(0, -(state.flapNotch / 3) * 0.06, 0));
      }
      if (trimWheel) {
        trimWheel.node.rotation.x = trimWheel.rotationX - pull * 0.6;
      }
      for (const { part, side } of pedals) {
        if (part) {
          part.node.rotation.x = part.rotationX + side * state.rudder * 0.22 - state.brake * 0.12;
        }
      }
    },
  };
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

/** The wet compass card: a heading tape seen through the window, lubber line in the middle. */
function drawCompassCard(ctx: CanvasRenderingContext2D, heading: number): void {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = "#e9e3c8";
  ctx.fillRect(0, 0, width, height);
  const pxPerDeg = 4;
  ctx.strokeStyle = "#1b1b1b";
  ctx.fillStyle = "#1b1b1b";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const first = Math.floor((heading - 40) / 5) * 5;
  for (let deg = first; deg <= heading + 40; deg += 5) {
    const x = width / 2 + (deg - heading) * pxPerDeg;
    const norm = ((deg % 360) + 360) % 360;
    const major = norm % 30 === 0;
    ctx.lineWidth = major ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(x, height - 4);
    ctx.lineTo(x, height - (major ? 34 : norm % 10 === 0 ? 24 : 16));
    ctx.stroke();
    if (major) {
      const label = ({ 0: "N", 90: "E", 180: "S", 270: "W" } as Record<number, string>)[norm] ?? String(norm / 10);
      ctx.font = `700 ${label.length === 1 && "NESW".includes(label) ? 40 : 34}px Helvetica, Arial, sans-serif`;
      ctx.fillText(label, x, 36);
    }
  }
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(width / 2 - 2, 0, 4, height);
}

/** Placards and switch legends, printed on the transparent sheet over the panel. */
function drawPlacards(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const at = (x: number, y: number): [number, number] => [(x - DECAL.left) * DECAL.pxPerMeter, (DECAL.top - y) * DECAL.pxPerMeter];
  const text = (x: number, y: number, value: string, sizeMeters: number, color = "#e8e6df", weight = 700) => {
    const [px, py] = at(x, y);
    ctx.fillStyle = color;
    ctx.font = `${weight} ${Math.round(sizeMeters * DECAL.pxPerMeter)}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(value, px, py);
  };
  // Rocker switch legends over the white strip above the switches.
  ["BAT", "ALT", "BCN", "LAND", "TAXI", "NAV", "STRB", "PITOT", "AVN"].forEach((label, i) => {
    text(-0.48 + i * 0.031, 0.03, label, 0.0072, "#1b1b1b");
  });
  text(-0.355, 0.045, "MASTER                    LIGHTS                    AVIONICS", 0.006, "#e8e6df", 600);
  text(-0.475, 0.087, "MAGNETOS", 0.0068);
  text(-0.475, 0.035, "OFF  R  L  BOTH  START", 0.0048, "#e8e6df", 600);
  // Engine controls and flaps.
  text(0.0, -0.012, "THROTTLE", 0.0062, "#1b1b1b");
  text(0.055, -0.012, "MIXTURE", 0.0062, "#1b1b1b");
  text(0.255, 0.098, "WING FLAPS", 0.0068);
  ["0°", "10°", "20°", "FULL"].forEach((label, i) => text(0.297, 0.05 - i * 0.02, label, 0.0058));
  // Right side: fuel, Hobbs, ELT, and the operating-limitations placard.
  text(0.355, 0.275, "FUEL QUANTITY", 0.0064, "#1b1b1b");
  text(0.45, 0.367, "HOURS", 0.0056);
  text(0.45, 0.304, "ELT", 0.0064);
  text(0.43, 0.228, "THIS AIRPLANE MUST BE OPERATED", 0.0046, "#1b1b1b", 600);
  text(0.43, 0.216, "AS A NORMAL OR UTILITY CATEGORY", 0.0046, "#1b1b1b", 600);
  text(0.43, 0.204, "AIRPLANE PER THE POH", 0.0046, "#1b1b1b", 600);
  // Left side: maneuvering speed and the tach and engine labels.
  text(-0.462, 0.395, "MANEUVERING", 0.0052);
  text(-0.462, 0.384, "SPEED 105 KIAS", 0.0052);
  text(0.13, 0.443, "C-CMLD", 0.0085);
  // Circuit breaker ratings.
  ["5", "10", "15", "5", "5", "10", "15", "5", "2", "5", "10"].forEach((rating, i) => text(0.25 + i * 0.024, -0.008, rating, 0.0055));
  text(0.37, -0.051, "CIRCUIT BREAKERS", 0.0058);
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
