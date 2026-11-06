import {
  ACESFilmicToneMapping,
  Euler,
  Matrix4,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FlightInput, type InputAction } from "../input/controls";
import { Landmarks } from "../landmarks/landmarks";
import { Aircraft, type CrashCause, type GroundContact, type GroundProbe } from "../physics/aircraft";
import { airDensity, SEA_LEVEL_DENSITY } from "../physics/atmosphere";
import { buildCessna, type CessnaModel } from "../render/cessna";
import { Clouds, Sky } from "../render/sky";
import { Terrain } from "../world/terrain";
import { Waypoints } from "../world/waypoints";
import { distanceMeters, EARTH_RADIUS, LocalFrame } from "./geo";
import { FlightSound } from "./sound";
import type { Start } from "./starts";

const PHYSICS_DT = 1 / 240;
const MAX_STEPS_PER_FRAME = 80;
/** Re-anchor the scene under the aircraft once it is this far from the origin. */
const REBASE_DISTANCE = 4_000;
const KNOTS = 1.943844;
const FEET = 3.28084;
const WARPS = [1, 2, 4, 8, 16] as const;
const DEG = Math.PI / 180;
/** Pilot's eye in body coordinates. */
const EYE = new Vector3(-0.27, 0.86, -0.06);

export type ViewMode = "cockpit" | "chase";
export type SimStatus = "menu" | "loading" | "flying" | "paused" | "crashed";

export interface Telemetry {
  readonly status: SimStatus;
  readonly view: ViewMode;
  readonly hud: boolean;
  readonly locked: boolean;
  readonly cursorMode: boolean;
  readonly indicatedKt: number;
  readonly altitudeFt: number;
  readonly aglFt: number | null;
  readonly verticalSpeedFpm: number;
  readonly headingDeg: number;
  readonly pitchDeg: number;
  readonly bankDeg: number;
  readonly throttle: number;
  readonly rpm: number;
  readonly flapDeg: number;
  readonly flapNotch: number;
  readonly brake: boolean;
  readonly stall: boolean;
  readonly onGround: boolean;
  readonly yokeX: number;
  readonly yokeY: number;
  readonly rudder: number;
  readonly warp: number;
  readonly crash: string | null;
  readonly place: string;
  readonly tilesLoading: number;
  readonly muted: boolean;
}

const CRASH_TEXT: Record<CrashCause, string> = {
  terrain: "You flew into the ground.",
  water: "You ended up in the water.",
  "hard-landing": "That landing was too hard for the gear.",
  "prop-strike": "The propeller hit the ground.",
  wingtip: "A wingtip hit the ground.",
  obstacle: "You hit a building.",
};

const PLACES: readonly { name: string; lat: number; lon: number }[] = [
  { name: "Toronto", lat: 43.653, lon: -79.383 },
  { name: "Mississauga", lat: 43.589, lon: -79.644 },
  { name: "Hamilton", lat: 43.255, lon: -79.871 },
  { name: "Waterloo", lat: 43.464, lon: -80.52 },
  { name: "Kitchener", lat: 43.451, lon: -80.493 },
  { name: "Guelph", lat: 43.545, lon: -80.248 },
  { name: "Lake Ontario", lat: 43.55, lon: -78.9 },
  { name: "San Francisco", lat: 37.774, lon: -122.419 },
  { name: "Golden Gate", lat: 37.8197, lon: -122.4787 },
  { name: "Oakland", lat: 37.804, lon: -122.271 },
  { name: "San Mateo", lat: 37.563, lon: -122.322 },
  { name: "Sausalito", lat: 37.859, lon: -122.485 },
];

export class Simulation {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(68, 1, 0.05, 400_000);
  private readonly sky: Sky;
  private readonly clouds = new Clouds();
  private readonly model: CessnaModel;
  private readonly aircraft = new Aircraft();
  private readonly input: FlightInput;
  private readonly sound = new FlightSound();
  private frame = new LocalFrame(43.63, -79.39);
  private readonly terrain: Terrain;
  private readonly landmarks: Landmarks;
  private readonly waypoints: Waypoints;
  private readonly resizeObserver: ResizeObserver;

  /** Dev-only: fly without pointer lock, for automated testing. */
  testMode = false;
  private status: SimStatus = "menu";
  /** Set by a click on Fly or "Click to fly"; the sim flies once the mouse is engaged. */
  private wantsToFly = false;
  private view: ViewMode = "cockpit";
  private hud = true;
  private warpIndex = 0;
  private start: Start | null = null;
  private crashText: string | null = null;
  private accumulator = 0;
  private lastTime = 0;
  private elapsed = 0;
  private frameCount = 0;
  private lastTelemetry = 0;
  private loadingSince = 0;
  private propAngle = 0;
  private raf = 0;

  private chaseYaw = 0;
  private chasePitch = 0;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly look = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, "YXZ");
  private readonly probe: GroundProbe;

  constructor(
    private readonly container: HTMLElement,
    private readonly onTelemetry: (telemetry: Telemetry) => void,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.sky = new Sky(this.scene);
    this.terrain = new Terrain(this.frame, Landmarks.exclusions());
    this.landmarks = new Landmarks(this.frame);
    this.waypoints = new Waypoints(this.frame);
    this.scene.add(this.terrain.group, this.landmarks.group, this.waypoints.group, this.clouds.group);

    this.model = buildCessna();
    this.scene.add(this.model.root);
    this.model.root.visible = false;

    this.input = new FlightInput(this.renderer.domElement, (action) => this.handleAction(action));
    this.renderer.domElement.addEventListener("click", () => {
      if (this.status === "paused" || this.status === "loading") {
        this.resume();
      }
    });

    this.probe = { probe: (point, out) => this.probeGround(point, out) };

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.sound.dispose();
    this.terrain.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Puts the aircraft at a start and waits for the ground there to load. */
  begin(start: Start): void {
    this.start = start;
    this.crashText = null;
    this.setFrame(new LocalFrame(start.lat, start.lon), true);
    this.aircraft.reset();
    // Starts above the ground wait for the terrain, then get placed (see updateLoading).
    this.aircraft.position.set(0, start.airborne?.altitude ?? 1_000, 0);
    this.aircraft.orientation.setFromAxisAngle(new Vector3(0, 1, 0), -start.heading * DEG);
    this.input.reset(start.airborne ? 0.62 : 0);
    if (start.airborne) {
      const pitch = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 2 * DEG);
      this.aircraft.orientation.multiply(pitch);
      const tas = start.airborne.speedKt / KNOTS / Math.sqrt(airDensity(this.aircraft.position.y) / SEA_LEVEL_DENSITY);
      this.aircraft.velocity.set(0, 0, -tas).applyQuaternion(this.aircraft.orientation);
      this.input.controls.elevator = -0.06;
    }
    this.aircraft.rpm = start.airborne ? 2_300 : 650;
    this.chaseYaw = -start.heading * DEG;
    this.chasePitch = 0;
    this.model.root.visible = true;
    this.status = "loading";
    this.loadingSince = performance.now();
    this.sound.start();
  }

  /** Dev-only access to the pilot's inputs and the aircraft, for automated test flights. */
  get debug() {
    return { controls: this.input.controls, aircraft: this.aircraft, terrain: this.terrain };
  }

  /** Called from a click: hands the mouse to the yoke and flies as soon as it's ours. */
  resume(): void {
    this.wantsToFly = true;
    this.input.engage();
    this.sound.start();
  }

  openMenu(): void {
    this.status = "menu";
    this.wantsToFly = false;
    this.input.disengage();
  }

  setView(view: ViewMode): void {
    this.view = view;
  }

  restart(): void {
    if (this.start) {
      this.begin(this.start);
    }
  }

  private handleAction(action: InputAction): void {
    switch (action) {
      case "toggle-view":
        this.view = this.view === "cockpit" ? "chase" : "cockpit";
        break;
      case "pause":
        if (this.status === "flying") {
          this.status = "paused";
          this.wantsToFly = false;
        } else if (this.status === "paused") {
          this.wantsToFly = true;
        }
        break;
      case "warp":
        this.warpIndex = (this.warpIndex + 1) % WARPS.length;
        break;
      case "restart":
        if (this.status === "crashed") {
          this.restart();
        }
        break;
      case "mute":
        this.sound.setMuted(!this.sound.muted);
        break;
      case "help":
        this.hud = !this.hud;
        break;
      case "menu":
        break;
    }
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /** Moves the scene origin, carrying the aircraft and camera across exactly. */
  private setFrame(next: LocalFrame, teleport = false): void {
    const previous = this.frame;
    if (!teleport) {
      const toEcef = (v: Vector3) => previous.directionToEcef(v.x, v.y, v.z);
      const direction = (v: Vector3) => {
        const d = next.directionFromEcef(toEcef(v));
        v.set(d[0], d[1], d[2]);
      };
      const point = (v: Vector3) => {
        const p = next.fromEcef(previous.toEcef(v.x, v.y, v.z));
        v.set(p[0], p[1], p[2]);
      };
      const ex = next.directionFromEcef(previous.directionToEcef(1, 0, 0));
      const ey = next.directionFromEcef(previous.directionToEcef(0, 1, 0));
      const ez = next.directionFromEcef(previous.directionToEcef(0, 0, 1));
      const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(...ex), new Vector3(...ey), new Vector3(...ez)));
      const before = this.aircraft.position.clone();
      point(this.aircraft.position);
      direction(this.aircraft.velocity);
      direction(this.aircraft.angularVelocity);
      this.aircraft.orientation.premultiply(rotation).normalize();
      this.clouds.shift(before.x - this.aircraft.position.x, before.z - this.aircraft.position.z);
    }
    this.frame = next;
    this.terrain.setFrame(next);
    this.landmarks.setFrame(next);
    this.waypoints.setFrame(next);
  }

  private probeGround(point: Vector3, out: GroundContact): boolean {
    const g = this.frame.toGeodetic(point.x, point.y, point.z);
    const ground = this.terrain.sample(g.lat, g.lon);
    let height = ground?.height ?? Number.NEGATIVE_INFINITY;
    let water = ground?.water ?? false;
    let slopeEast = ground?.slopeEast ?? 0;
    let slopeNorth = ground?.slopeNorth ?? 0;
    const deck = this.landmarks.surfaceUnder(g.lat, g.lon, g.alt);
    if (deck !== null && deck > height) {
      height = deck;
      water = false;
      slopeEast = 0;
      slopeNorth = 0;
    }
    if (!Number.isFinite(height)) {
      return false;
    }
    // Ground normal in scene axes (east, up, south); the local up at the
    // point tilts a hair from the origin's over a few km, which is negligible.
    out.normal.set(-slopeEast, 1, slopeNorth).normalize();
    out.depth = (height - g.alt) * out.normal.y;
    out.water = water;
    return true;
  }

  private tick(now: number): void {
    this.raf = requestAnimationFrame((t) => this.tick(t));
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsed += dt;
    this.frameCount++;
    this.input.update(dt);

    if (this.status === "loading") {
      this.updateLoading();
    }
    const engaged = this.input.engaged || this.testMode;
    if (this.status === "paused" && this.wantsToFly && engaged) {
      this.status = "flying";
    }
    if (this.status === "flying" && !engaged && !this.input.engaging) {
      // Losing the mouse (Esc, switching tabs) pauses the flight.
      this.status = "paused";
      this.wantsToFly = false;
    }
    if (this.status === "flying") {
      this.stepPhysics(dt);
    }
    if (this.status !== "menu") {
      this.maybeRebase();
    }
    this.updateVisuals(dt);
    this.updateCamera(dt);
    this.updateWorld();
    this.renderer.render(this.scene, this.camera);
    this.publish(now);
  }

  private updateLoading(): void {
    const a = this.aircraft;
    const g = this.frame.toGeodetic(a.position.x, a.position.y, a.position.z);
    const ground = this.terrain.sample(g.lat, g.lon);
    const waited = performance.now() - this.loadingSince;
    const start = this.start;
    if (!start) {
      return;
    }
    if (start.airborne) {
      // Wait for detailed ground so you don't fly out into an empty world.
      if ((ground && ground.zoom >= 13) || waited > 20_000) {
        const aboveGround = start.airborne.aboveGround;
        if (aboveGround !== undefined && ground) {
          a.position.y = ground.height + aboveGround;
        }
        this.status = "paused";
      }
      return;
    }
    if (ground && ground.zoom >= 14) {
      // Settle on the gear: CG 1.15 m above the tyres' contact points.
      a.position.y = ground.height + 1.16;
      a.velocity.set(0, 0, 0);
      this.status = "paused";
    }
  }

  private stepPhysics(dt: number): void {
    const warp = WARPS[this.warpIndex] ?? 1;
    this.accumulator = Math.min(this.accumulator + dt * warp, PHYSICS_DT * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= PHYSICS_DT) {
      this.aircraft.step(this.input.controls, this.probe, PHYSICS_DT);
      this.accumulator -= PHYSICS_DT;
      if (this.aircraft.crashed) {
        break;
      }
    }
    const a = this.aircraft;
    if (!a.crashed) {
      const hit = this.landmarks.collision(this.frame, a.position.x, a.position.y, a.position.z);
      if (hit) {
        a.crashed = "obstacle";
        this.crashText = `You hit the ${hit}.`;
      } else {
        const g = this.frame.toGeodetic(a.position.x, a.position.y, a.position.z);
        for (const obstacle of this.terrain.obstaclesNear(g.lat, g.lon)) {
          if (g.alt < obstacle.top && distanceMeters(g, obstacle) < obstacle.radius * 0.85) {
            a.crashed = "obstacle";
            break;
          }
        }
      }
    }
    if (a.crashed) {
      this.crashText ??= CRASH_TEXT[a.crashed];
      this.status = "crashed";
      this.warpIndex = 0;
    }
  }

  private maybeRebase(): void {
    const p = this.aircraft.position;
    if (Math.hypot(p.x, p.z) < REBASE_DISTANCE) {
      return;
    }
    const g = this.frame.toGeodetic(p.x, p.y, p.z);
    this.setFrame(new LocalFrame(g.lat, g.lon));
  }

  private updateVisuals(dt: number): void {
    const a = this.aircraft;
    const m = this.model;
    m.root.position.copy(a.position);
    m.root.quaternion.copy(a.orientation);
    m.elevator.angle = a.elevator * (a.elevator > 0 ? 28 : 23) * DEG;
    m.leftAileron.angle = -a.aileron * 18 * DEG;
    m.rightAileron.angle = -a.aileron * 18 * DEG;
    m.rudder.angle = -a.rudder * 16 * DEG;
    m.leftFlap.angle = -a.flapDeg * DEG;
    m.rightFlap.angle = a.flapDeg * DEG;

    // The eye can't follow a real prop, so cap the visible spin and fade in a blur disc.
    const running = this.status !== "menu" && !a.crashed;
    const radPerSecond = running ? Math.min((a.rpm / 60) * Math.PI * 2, 21) : 0;
    this.propAngle += radPerSecond * dt;
    m.propeller.rotation.z = this.propAngle;
    // Above idle the blades smear into a translucent disc, as they do to the eye.
    const blur = running ? Math.min(1, Math.max(0, (a.rpm - 200) / 300)) : 0;
    (m.propDisc.material as { opacity: number }).opacity = blur * (this.view === "cockpit" ? 0.1 : 0.16);
    m.propDisc.visible = blur > 0;
    m.blades.visible = blur < 1;

    m.beacon.visible = Math.floor(this.elapsed * 1.1) % 2 === 0;
    const strobePhase = this.elapsed % 1.3;
    const strobeOn = strobePhase < 0.06 || (strobePhase > 0.16 && strobePhase < 0.22);
    for (const strobe of m.strobes) {
      strobe.visible = strobeOn;
    }

    const inCockpit = this.view === "cockpit";
    m.pilot.visible = !inCockpit;
    m.glass.opacity = inCockpit ? 0.08 : 0.86;

    const up = this.tmp.set(a.position.x, a.position.y + EARTH_RADIUS, a.position.z).normalize();
    const g = a.angularVelocity;
    m.cockpit.update({
      airspeedKt: a.indicatedAirspeed * KNOTS,
      pitchDeg: a.pitchDeg(),
      bankDeg: a.bankDeg(),
      altitudeFt: a.altitude() * FEET,
      headingDeg: a.heading(),
      verticalSpeedFpm: a.velocity.dot(up) * FEET * 60,
      turnRateDeg: (-g.dot(up) / DEG) * 1,
      slip: a.beta * 2,
      rpm: running ? a.rpm : 0,
      throttle: this.input.controls.throttle,
      flapDeg: a.flapDeg,
      flapNotch: this.input.controls.flapNotch,
      elevator: a.elevator,
      aileron: a.aileron,
      rudder: a.rudder,
      brake: this.input.controls.brake,
    });
  }

  private updateCamera(dt: number): void {
    const a = this.aircraft;
    const cam = this.camera;
    if (this.view === "cockpit") {
      cam.position.copy(EYE).applyQuaternion(a.orientation).add(a.position);
      // Eyes rest a little below the horizon, so the six-pack is in view.
      this.euler.set(this.input.lookPitch - 0.1, this.input.lookYaw, 0);
      this.look.setFromEuler(this.euler);
      cam.quaternion.copy(a.orientation).multiply(this.look);
      cam.near = 0.04;
      cam.fov = 70 / this.input.zoom;
    } else {
      // Chase: behind and above along the heading, horizon kept level. The
      // camera's angles are smoothed rather than its position, so it never
      // falls behind however fast the aircraft (or time warp) goes.
      const forward = this.tmp.set(0, 0, -1).applyQuaternion(a.orientation);
      const yaw = Math.atan2(-forward.x, -forward.z);
      const pitch = Math.asin(Math.max(-1, Math.min(1, forward.y))) * 0.5;
      const k = 1 - Math.exp(-dt * 5);
      this.chaseYaw += (((yaw - this.chaseYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k;
      this.chasePitch += (pitch - this.chasePitch) * k;
      this.euler.set(this.chasePitch - 0.16 + this.input.lookPitch, this.chaseYaw + this.input.lookYaw, 0);
      const offset = this.tmp2.set(0, 0, 15).applyEuler(this.euler);
      offset.y += 1.5;
      cam.position.copy(a.position).add(offset);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.tmp.copy(a.position).add(this.tmp2.set(0, 1, 0)));
      cam.near = 0.3;
      cam.fov = 60 / this.input.zoom;
    }
    cam.updateProjectionMatrix();
  }

  private updateWorld(): void {
    const cam = this.camera.position;
    const camGeo = this.frame.toGeodetic(cam.x, cam.y, cam.z);
    const ground = this.terrain.sample(camGeo.lat, camGeo.lon);
    const agl = camGeo.alt - (ground?.height ?? 0);
    if (this.frameCount % 3 === 0 || this.status === "loading") {
      this.terrain.update(camGeo.lat, camGeo.lon, agl);
    }
    this.landmarks.update(this.terrain, camGeo.lat, camGeo.lon, this.elapsed);
    this.waypoints.update(this.terrain, camGeo.lat, camGeo.lon);
    this.sky.update(cam, this.aircraft.position, camGeo.alt);
    this.clouds.update(this.aircraft.position, this.elapsed);
    const a = this.aircraft;
    this.sound.update(a.rpm, this.input.controls.throttle, a.airspeed, a.stallWarning, this.status === "flying");
  }

  private publish(now: number): void {
    if (now - this.lastTelemetry < 90) {
      return;
    }
    this.lastTelemetry = now;
    const a = this.aircraft;
    const g = this.frame.toGeodetic(a.position.x, a.position.y, a.position.z);
    const ground = this.terrain.sample(g.lat, g.lon);
    const up = this.tmp.set(a.position.x, a.position.y + EARTH_RADIUS, a.position.z).normalize();
    let place = `${Math.abs(g.lat).toFixed(2)}°${g.lat >= 0 ? "N" : "S"} ${Math.abs(g.lon).toFixed(2)}°${g.lon >= 0 ? "E" : "W"}`;
    let best = 45_000;
    for (const candidate of PLACES) {
      const d = distanceMeters(g, candidate);
      if (d < best) {
        best = d;
        place = candidate.name;
      }
    }
    const c = this.input.controls;
    this.onTelemetry({
      status: this.status,
      view: this.view,
      hud: this.hud,
      locked: this.input.engaged,
      cursorMode: this.input.cursorMode,
      indicatedKt: a.indicatedAirspeed * KNOTS,
      altitudeFt: g.alt * FEET,
      aglFt: ground ? (g.alt - ground.height - 1.15) * FEET : null,
      verticalSpeedFpm: a.velocity.dot(up) * FEET * 60,
      headingDeg: a.heading(),
      pitchDeg: a.pitchDeg(),
      bankDeg: a.bankDeg(),
      throttle: c.throttle,
      rpm: a.rpm,
      flapDeg: a.flapDeg,
      flapNotch: c.flapNotch,
      brake: c.brake > 0,
      stall: a.stallWarning > 0.6 && !a.onGround,
      onGround: a.onGround,
      yokeX: c.aileron,
      yokeY: c.elevator,
      rudder: c.rudder,
      warp: WARPS[this.warpIndex] ?? 1,
      crash: this.status === "crashed" ? this.crashText : null,
      place,
      tilesLoading: this.terrain.pending,
      muted: this.sound.muted,
    });
  }
}
