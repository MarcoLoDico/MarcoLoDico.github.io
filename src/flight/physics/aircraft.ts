import { Quaternion, Vector3 } from "three";
import { EARTH_RADIUS } from "../sim/geo";
import { airDensity, SEA_LEVEL_DENSITY } from "./atmosphere";
import { C172 } from "./c172";

const GRAVITY = 9.80665;
const DEG = Math.PI / 180;

/** Pilot inputs, all normalised. */
export interface ControlInputs {
  /** -1 full forward (nose down) … +1 full back (nose up). */
  elevator: number;
  /** -1 full left … +1 full right. */
  aileron: number;
  /** -1 left pedal … +1 right pedal. */
  rudder: number;
  /** 0 idle … 1 full. */
  throttle: number;
  /** Selected flap notch index. */
  flapNotch: number;
  /** 0 … 1 toe brakes. */
  brake: number;
}

export function neutralControls(): ControlInputs {
  return { elevator: 0, aileron: 0, rudder: 0, throttle: 0, flapNotch: 0, brake: 0 };
}

export interface GroundContact {
  /** How far below the surface the point is, metres along the surface normal. */
  depth: number;
  /** Surface normal in scene coordinates. */
  normal: Vector3;
  water: boolean;
}

/** Lets the flight model ask the world what is under a point. */
export interface GroundProbe {
  /** Fills `out` and returns true if the scene point is within reach of the ground. */
  probe(point: Vector3, out: GroundContact): boolean;
}

export type CrashCause = "terrain" | "water" | "hard-landing" | "prop-strike" | "wingtip" | "obstacle";

export class Aircraft {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly orientation = new Quaternion();
  /** Angular velocity in scene coordinates, rad/s. */
  readonly angularVelocity = new Vector3();

  /** Actual surface positions, which chase the pilot's inputs at servo speed. */
  elevator = 0;
  aileron = 0;
  rudder = 0;
  flapDeg = 0;
  rpm: number = C172.engine.idleRpm;
  thrust = 0;

  // Telemetry from the last step, for the HUD and sound.
  alpha = 0;
  beta = 0;
  airspeed = 0;
  indicatedAirspeed = 0;
  stallWarning = 0;
  /** Height of the wing above the ground, for ground effect; Infinity when far up. */
  wingHeight = Infinity;
  onGround = false;
  wheelLoad = 0;
  crashed: CrashCause | null = null;

  private readonly wheelCompression = [0, 0, 0];
  private stallBias = 0;

  // Scratch vectors so the 240 Hz loop never allocates.
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly force = new Vector3();
  private readonly torque = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly pointWorld = new Vector3();
  private readonly pointVelocity = new Vector3();
  private readonly contact: GroundContact = { depth: 0, normal: new Vector3(), water: false };
  private readonly spin = new Quaternion();

  reset(): void {
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.elevator = 0;
    this.aileron = 0;
    this.rudder = 0;
    this.crashed = null;
    this.stallBias = 0;
    this.wheelCompression.fill(0);
  }

  /** Altitude above the sphere, given the scene origin sits on the surface. */
  altitude(): number {
    const p = this.position;
    return Math.hypot(p.x, p.y + EARTH_RADIUS, p.z) - EARTH_RADIUS;
  }

  /** True heading in degrees, 0 = north. */
  heading(): number {
    this.forward.set(0, 0, -1).applyQuaternion(this.orientation);
    const deg = Math.atan2(this.forward.x, -this.forward.z) / DEG;
    return (deg + 360) % 360;
  }

  pitchDeg(): number {
    this.forward.set(0, 0, -1).applyQuaternion(this.orientation);
    return Math.asin(Math.max(-1, Math.min(1, this.forward.y))) / DEG;
  }

  bankDeg(): number {
    this.right.set(1, 0, 0).applyQuaternion(this.orientation);
    this.up.set(0, 1, 0).applyQuaternion(this.orientation);
    return Math.atan2(-this.right.y, this.up.y) / DEG;
  }

  step(controls: ControlInputs, ground: GroundProbe, dt: number): void {
    if (this.crashed) {
      return;
    }
    this.moveSurfaces(controls, dt);

    const q = this.orientation;
    this.forward.set(0, 0, -1).applyQuaternion(q);
    this.right.set(1, 0, 0).applyQuaternion(q);
    this.up.set(0, 1, 0).applyQuaternion(q);
    this.force.set(0, 0, 0);
    this.torque.set(0, 0, 0);

    const altitude = this.altitude();
    this.measureWingHeight(ground);
    const rho = airDensity(altitude);
    this.applyEngine(controls, rho, dt);
    this.applyAerodynamics(rho);
    this.applyGravity();
    this.onGround = this.applyGround(controls, ground);
    if (this.hasCrashed()) {
      return;
    }
    this.integrate(dt);
  }

  /** The wing sits about 1.1 m above the centre of gravity on a high-wing 172. */
  private measureWingHeight(ground: GroundProbe): void {
    this.pointWorld.copy(this.position);
    if (ground.probe(this.pointWorld, this.contact)) {
      this.wingHeight = Math.max(0, -this.contact.depth + 1.1);
    } else {
      this.wingHeight = Infinity;
    }
  }

  /** Re-reads the field: the ground pass can set it after the check at the top of step(). */
  private hasCrashed(): boolean {
    return this.crashed !== null;
  }

  private moveSurfaces(controls: ControlInputs, dt: number): void {
    const approach = (current: number, target: number, rate: number) =>
      current + Math.max(-rate * dt, Math.min(rate * dt, target - current));
    this.elevator = approach(this.elevator, clamp(controls.elevator, -1, 1), 4);
    this.aileron = approach(this.aileron, clamp(controls.aileron, -1, 1), 4);
    this.rudder = approach(this.rudder, clamp(controls.rudder, -1, 1), 3);
    const notch = C172.flapNotches[clamp(Math.round(controls.flapNotch), 0, C172.flapNotches.length - 1)] ?? 0;
    this.flapDeg = approach(this.flapDeg, notch, C172.flapRateDegPerSecond);
  }

  private applyEngine(controls: ControlInputs, rho: number, dt: number): void {
    const { engine } = C172;
    const throttle = clamp(controls.throttle, 0, 1);
    const airspeed = this.velocity.dot(this.forward);
    // Fixed-pitch prop: rpm rises with both power and airspeed (windmilling).
    const targetRpm = clamp(engine.idleRpm + 1_650 * throttle + 6 * Math.max(0, airspeed), engine.idleRpm, engine.maxRpm + 150);
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 2.5);

    const densityRatio = rho / SEA_LEVEL_DENSITY;
    const powerLapse = Math.max(0, (densityRatio - 0.12) / 0.88);
    const power = engine.maxPower * powerLapse * (0.04 + 0.96 * throttle);
    const v0 = (engine.propEfficiency * engine.maxPower) / engine.staticThrust;
    const forwardSpeed = Math.max(0, airspeed);
    this.thrust = (engine.propEfficiency * power) / Math.sqrt(forwardSpeed * forwardSpeed + v0 * v0);
    this.force.addScaledVector(this.forward, this.thrust);
  }

  private applyAerodynamics(rho: number): void {
    const v = this.velocity;
    const speed = v.length();
    this.airspeed = speed;
    this.indicatedAirspeed = speed * Math.sqrt(rho / SEA_LEVEL_DENSITY);
    const { wingArea: S, wingSpan: b, chord: c, lift, drag } = C172;

    // Propwash speeds up the air over the tail (momentum theory: q rises by
    // T/A in the fully developed slipstream; the tail sits partly in it), so
    // the rudder and elevator still work on the ground with power, without
    // making the nose easy to over-rotate at low speed.
    const diskArea = Math.PI * (C172.engine.propDiameter / 2) ** 2;
    const qbar = 0.5 * rho * speed * speed;
    const tailQ = qbar + (0.14 * this.thrust) / diskArea;
    const elevatorRad = this.elevator >= 0 ? -this.elevator * C172.elevatorUp : -this.elevator * C172.elevatorDown;
    const aileronRad = this.aileron * C172.aileronThrow;
    const rudderRad = -this.rudder * C172.rudderThrow;
    const tailPitch = tailQ * S * c * C172.pitch.perElevator * elevatorRad;
    const tailYaw = tailQ * S * b * C172.yaw.perRudder * rudderRad;
    const tailRoll = tailQ * S * b * C172.roll.perRudder * rudderRad;
    this.torque.addScaledVector(this.right, tailPitch);
    this.torque.addScaledVector(this.up, -tailYaw);
    this.torque.addScaledVector(this.forward, tailRoll);

    // Engine torque and P-factor: left roll and yaw, strongest at high power
    // and high angle of attack, which is why a 172 wants right rudder on climb-out.
    const thrustRatio = this.thrust / C172.engine.staticThrust;
    this.torque.addScaledVector(this.forward, -60 * thrustRatio);
    this.torque.addScaledVector(this.up, 150 * thrustRatio * (1 + 3 * Math.max(0, this.alpha)));
    // The fin is offset and the ailerons rigged to cancel that in cruise, as on the real aircraft.
    this.torque.addScaledVector(this.forward, qbar * S * b * 0.00012);
    this.torque.addScaledVector(this.up, -qbar * S * b * 0.00028);

    if (speed < 0.5) {
      this.alpha = 0;
      this.beta = 0;
      this.stallWarning = 0;
      return;
    }

    const u = v.dot(this.forward);
    const side = v.dot(this.right);
    const down = -v.dot(this.up);
    const alpha = Math.atan2(down, u);
    const beta = Math.asin(clamp(side / speed, -1, 1));
    this.alpha = alpha;
    this.beta = beta;
    const flap = this.flapDeg / 30;

    // Body rates (aero convention: p roll right, q pitch up, r yaw right).
    const w = this.angularVelocity;
    const rateSpeed = Math.max(speed, 15);
    const p = (w.dot(this.forward) * b) / (2 * rateSpeed);
    const qRate = (w.dot(this.right) * c) / (2 * rateSpeed);
    const r = (-w.dot(this.up) * b) / (2 * rateSpeed);

    // Lift: linear to CLmax, then a gentle break that fades into flat-plate
    // lift deep in the stall, the way the 172's docile wing behaves.
    const cl0 = lift.zeroAlpha + lift.fullFlaps * flap;
    const clMax = lift.maxClean + (lift.maxFullFlaps - lift.maxClean) * flap;
    const stallAlpha = (clMax - cl0) / lift.perAlpha;
    const negativeStallAlpha = (lift.minimum - cl0) / lift.perAlpha;
    const flatPlate = 1.15 * Math.sin(2 * alpha);
    let stall = 0;
    let cl = cl0 + lift.perAlpha * alpha;
    if (alpha > stallAlpha) {
      stall = smoothstep(0, 0.1, alpha - stallAlpha);
      const shelf = clMax * 0.72 * clamp(1 - (alpha - stallAlpha - 0.2) / 0.4, 0, 1);
      cl = lerp(clMax, Math.max(flatPlate, shelf), stall);
    } else if (alpha < negativeStallAlpha) {
      stall = smoothstep(0, 0.1, negativeStallAlpha - alpha);
      cl = lerp(lift.minimum, Math.min(flatPlate, lift.minimum * 0.7), stall);
    }
    cl += lift.perPitchRate * qRate + lift.perElevator * elevatorRad;
    // The 172's stall warning is a reed horn fed by a slot in the left wing's
    // leading edge: it starts to sound around 5–10 kt above the stall, i.e.
    // once the wing is working at roughly three quarters of its maximum lift.
    const liftFraction = (cl0 + lift.perAlpha * alpha) / clMax;
    this.stallWarning = smoothstep(0.7, 0.93, liftFraction);

    // Ground effect: within about a wingspan of the runway the ground blocks
    // the wingtip vortices, cutting induced drag and adding a little lift —
    // why a 172 floats in the flare.
    const span = this.wingHeight / b;
    const groundFactor = span < 1.5 ? (16 * span) ** 2 / (1 + (16 * span) ** 2) : 1;
    cl *= 1 + 0.1 * (1 - groundFactor);

    const cd =
      drag.parasite + drag.induced * groundFactor * Math.min(cl, clMax) ** 2 + drag.fullFlaps * flap + 1.25 * stall * Math.sin(alpha) ** 2;
    const cy = C172.side.perBeta * beta + C172.side.perRudder * rudderRad * (tailQ / qbar);

    // A stalled wing loses roll damping and one side lets go first, so the
    // aircraft drops a wing and, with rudder or yaw, autorotates into a spin.
    if (stall > 0.2 && this.stallBias === 0) {
      this.stallBias = (Math.random() < 0.5 ? -1 : 1) * (0.015 + Math.random() * 0.02);
    } else if (stall === 0) {
      this.stallBias = 0;
    }
    const rollDamping = lerp(C172.roll.perRollRate, 0.15, stall);

    const cRoll =
      C172.roll.perBeta * beta +
      rollDamping * p +
      C172.roll.perYawRate * r +
      C172.roll.perAileron * aileronRad * (1 - 0.5 * stall) +
      this.stallBias * stall;
    const cPitch =
      C172.pitch.zero +
      C172.pitch.perAlpha * Math.sin(alpha) +
      C172.pitch.perPitchRate * qRate +
      C172.pitch.fullFlaps * flap;
    const cYaw = C172.yaw.perBeta * beta + C172.yaw.perRollRate * p + C172.yaw.perYawRate * r + C172.yaw.perAileron * aileronRad;

    // Forces: lift ⟂ to the airflow in the plane of symmetry, drag along it.
    const vHat = this.tmp.copy(v).divideScalar(speed);
    const liftDir = this.tmp2.crossVectors(this.right, vHat);
    if (liftDir.lengthSq() > 1e-8) {
      liftDir.normalize();
      this.force.addScaledVector(liftDir, qbar * S * cl);
    }
    this.force.addScaledVector(vHat, -qbar * S * cd);
    this.force.addScaledVector(this.right, qbar * S * cy);

    // Moments in body axes: roll about forward, pitch about right, yaw about down.
    this.torque.addScaledVector(this.forward, qbar * S * b * cRoll);
    this.torque.addScaledVector(this.right, qbar * S * c * cPitch);
    this.torque.addScaledVector(this.up, -qbar * S * b * cYaw);
  }

  private applyGravity(): void {
    const p = this.position;
    const up = this.tmp.set(p.x, p.y + EARTH_RADIUS, p.z).normalize();
    this.force.addScaledVector(up, -GRAVITY * C172.mass);
  }

  private applyGround(controls: ControlInputs, ground: GroundProbe): boolean {
    const { gear } = C172;
    let touching = false;
    let load = 0;
    const wheels = [gear.mainLeft, gear.mainRight, gear.nose] as const;
    for (let i = 0; i < wheels.length; i++) {
      const wheel = wheels[i];
      if (!wheel) {
        continue;
      }
      const isNose = i === 2;
      this.worldPoint(wheel);
      if (!ground.probe(this.pointWorld, this.contact) || this.contact.depth <= 0) {
        this.wheelCompression[i] = 0;
        continue;
      }
      if (this.contact.water) {
        this.crashed = "water";
        return true;
      }
      touching = true;
      const n = this.contact.normal;
      const depth = this.contact.depth;
      const normalSpeed = this.pointVelocity.dot(n);
      if (depth > gear.maxCompression || normalSpeed < -4.2) {
        this.crashed = "hard-landing";
        return true;
      }
      this.wheelCompression[i] = depth;
      const stiffness = isNose ? gear.noseStiffness : gear.mainStiffness;
      const damping = isNose ? gear.noseDamping : gear.mainDamping;
      const normalForce = Math.max(0, stiffness * depth - damping * normalSpeed);
      load += normalForce;

      // Rolling direction: the aircraft's nose projected onto the ground,
      // turned by nosewheel steering for the nose gear.
      const rollDir = this.tmp.copy(this.forward).addScaledVector(n, -this.forward.dot(n)).normalize();
      if (isNose) {
        const steer = -this.rudder * gear.noseSteerDeg * DEG;
        rollDir.applyAxisAngle(n, steer);
      }
      const sideDir = this.tmp2.crossVectors(rollDir, n);
      const vTangent = this.pointVelocity.addScaledVector(n, -normalSpeed);
      const vRoll = vTangent.dot(rollDir);
      const vSide = vTangent.dot(sideDir);
      const rollingFriction = gear.rollingFriction + (isNose ? 0 : controls.brake * gear.brakeFriction);
      // Rolling resistance reaches full strength by 5 cm/s, so idle thrust alone won't creep.
      const longitudinal = -clamp(vRoll / 0.05, -1, 1) * rollingFriction * normalForce;
      const lateral = -clamp(vSide / 0.25, -1, 1) * gear.lateralFriction * normalForce;

      const f = vTangent.copy(n).multiplyScalar(normalForce).addScaledVector(rollDir, longitudinal).addScaledVector(sideDir, lateral);
      this.addForceAt(f);
    }
    this.wheelLoad = load;

    for (const [name, point] of Object.entries(C172.hardPoints)) {
      this.worldPoint(point);
      if (!ground.probe(this.pointWorld, this.contact) || this.contact.depth <= 0) {
        continue;
      }
      if (this.contact.water) {
        this.crashed = "water";
        return true;
      }
      const impact = -this.pointVelocity.dot(this.contact.normal);
      if (name === "propTip") {
        this.crashed = "prop-strike";
        return true;
      }
      if (name === "leftWingtip" || name === "rightWingtip") {
        this.crashed = "wingtip";
        return true;
      }
      if (impact > 2.5) {
        this.crashed = "terrain";
        return true;
      }
      // A scraped tail or belly: a stiff skid with lots of friction.
      touching = true;
      const n = this.contact.normal;
      const normalForce = Math.max(0, 80_000 * this.contact.depth + 8_000 * impact);
      const vTangent = this.pointVelocity.addScaledVector(n, impact);
      const f = this.tmp.copy(n).multiplyScalar(normalForce);
      const slide = vTangent.length();
      if (slide > 0.01) {
        f.addScaledVector(vTangent, (-0.5 * normalForce * Math.min(1, slide / 0.5)) / slide);
      }
      this.addForceAt(f);
    }
    return touching;
  }

  /** Sets pointWorld and pointVelocity for a body-frame point. */
  private worldPoint(body: readonly [number, number, number]): void {
    this.pointWorld.set(body[0], body[1], body[2]).applyQuaternion(this.orientation);
    this.pointVelocity.crossVectors(this.angularVelocity, this.pointWorld).add(this.velocity);
    // pointWorld temporarily holds the lever arm; keep a copy for the torque.
    this.lever.copy(this.pointWorld);
    this.pointWorld.add(this.position);
  }

  private readonly lever = new Vector3();

  private addForceAt(f: Vector3): void {
    this.force.add(f);
    this.torque.add(this.tmp2.crossVectors(this.lever, f));
  }

  private integrate(dt: number): void {
    this.velocity.addScaledVector(this.force, dt / C172.mass);
    this.position.addScaledVector(this.velocity, dt);

    // Rotational dynamics in body axes: ω̇ = I⁻¹(τ − ω × Iω).
    const inverse = this.spin.copy(this.orientation).invert();
    const w = this.tmp.copy(this.angularVelocity).applyQuaternion(inverse);
    const tau = this.tmp2.copy(this.torque).applyQuaternion(inverse);
    const { pitch: ix, yaw: iy, roll: iz } = C172.inertia;
    const hx = ix * w.x;
    const hy = iy * w.y;
    const hz = iz * w.z;
    const gx = w.y * hz - w.z * hy;
    const gy = w.z * hx - w.x * hz;
    const gz = w.x * hy - w.y * hx;
    w.x += ((tau.x - gx) / ix) * dt;
    w.y += ((tau.y - gy) / iy) * dt;
    w.z += ((tau.z - gz) / iz) * dt;
    this.angularVelocity.copy(w.applyQuaternion(this.orientation));

    const omega = this.angularVelocity;
    const angle = omega.length() * dt;
    if (angle > 1e-9) {
      this.spin.setFromAxisAngle(this.tmp.copy(omega).normalize(), angle);
      this.orientation.premultiply(this.spin).normalize();
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
