import { describe, expect, it } from "vitest";
import { Aircraft, neutralControls, type ControlInputs, type GroundProbe } from "./aircraft";

const DT = 1 / 240;
const KNOTS = 1.943844;
const inTheAir: GroundProbe = { probe: () => false };

function airborne(speed: number, altitude: number): Aircraft {
  const aircraft = new Aircraft();
  aircraft.position.set(0, altitude, 0);
  aircraft.velocity.set(0, 0, -speed);
  return aircraft;
}

/** A simple autopilot: hold altitude with the elevator and wings level with the ailerons. */
function holdLevel(aircraft: Aircraft, controls: ControlInputs, target: number, seconds: number): void {
  let integral = 0;
  for (let t = 0; t < seconds; t += DT) {
    const error = target - aircraft.altitude();
    integral += error * DT;
    controls.elevator = Math.max(-1, Math.min(1, 0.004 * error - 0.03 * aircraft.velocity.y + 0.0004 * integral - 0.6 * aircraft.angularVelocity.x));
    controls.aileron = Math.max(-1, Math.min(1, -aircraft.bankDeg() * 0.03));
    aircraft.step(controls, inTheAir, DT);
  }
}

describe("Cessna 172 flight model", () => {
  it("reaches about 117 KIAS flat out at 3,300 ft, like the POH", () => {
    const aircraft = airborne(50, 1000);
    const controls = { ...neutralControls(), throttle: 1 };
    holdLevel(aircraft, controls, 1000, 120);
    expect(aircraft.indicatedAirspeed * KNOTS).toBeGreaterThan(110);
    expect(aircraft.indicatedAirspeed * KNOTS).toBeLessThan(124);
  });

  it("climbs at roughly 700 ft/min at Vy with full power", () => {
    const aircraft = airborne(38, 100);
    const controls = { ...neutralControls(), throttle: 1 };
    let integral = 0;
    for (let t = 0; t < 60; t += DT) {
      const error = 9 - aircraft.pitchDeg();
      integral += error * DT;
      controls.elevator = Math.max(-1, Math.min(1, 0.06 * error + 0.05 * integral - 0.8 * aircraft.angularVelocity.x));
      controls.aileron = -aircraft.bankDeg() * 0.03;
      aircraft.step(controls, inTheAir, DT);
    }
    const fpm = aircraft.velocity.y * 196.85;
    expect(fpm).toBeGreaterThan(550);
    expect(fpm).toBeLessThan(850);
  });

  it("stalls clean in the high 40s of knots", () => {
    const aircraft = airborne(35, 1000);
    const controls = neutralControls();
    let stallKt = 0;
    for (let t = 0; t < 40 && stallKt === 0; t += DT) {
      controls.elevator = Math.min(1, t / 25);
      controls.aileron = -aircraft.bankDeg() * 0.03;
      aircraft.step(controls, inTheAir, DT);
      if (aircraft.alpha > 0.241) {
        stallKt = aircraft.indicatedAirspeed * KNOTS;
      }
    }
    expect(stallKt).toBeGreaterThan(44);
    expect(stallKt).toBeLessThan(54);
  });

  it("sits on its gear and rolls forward under power", () => {
    const flat: GroundProbe = {
      probe(point, out) {
        out.depth = -point.y;
        out.normal.set(0, 1, 0);
        out.water = false;
        return true;
      },
    };
    const aircraft = new Aircraft();
    aircraft.position.set(0, 1.21, 0);
    const controls = neutralControls();
    for (let t = 0; t < 3; t += DT) {
      aircraft.step(controls, flat, DT);
    }
    expect(aircraft.crashed).toBeNull();
    expect(aircraft.onGround).toBe(true);
    expect(Math.abs(aircraft.velocity.z)).toBeLessThan(0.2);

    controls.throttle = 1;
    for (let t = 0; t < 10; t += DT) {
      aircraft.step(controls, flat, DT);
    }
    expect(aircraft.crashed).toBeNull();
    expect(-aircraft.velocity.z).toBeGreaterThan(10);
  });
});
