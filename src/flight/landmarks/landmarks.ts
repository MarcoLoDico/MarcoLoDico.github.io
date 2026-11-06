import { Group, Matrix4, Object3D } from "three";
import { LocalFrame, toEcef, type Vec3 } from "../sim/geo";
import type { Terrain } from "../world/terrain";
import type { Exclusion } from "../world/tileProtocol";
import { sanFranciscoLandmarks } from "./sanFrancisco";
import { torontoLandmarks } from "./toronto";
import { rotateYaw, type LandmarkSpec } from "./types";
import { waterlooLandmarks } from "./waterloo";

const ALL: readonly LandmarkSpec[] = [...torontoLandmarks, ...waterlooLandmarks, ...sanFranciscoLandmarks];
const DRAW_DISTANCE = 120_000;

interface Placed {
  readonly spec: LandmarkSpec;
  readonly frame: LocalFrame;
  readonly root: Object3D;
  readonly beacons: Object3D[];
  base: number;
  /** Zoom of the terrain tile the base height came from; finer tiles re-seat it. */
  groundZoom: number;
}

/** Places the hand-made landmarks in the world, seats them on the terrain, and answers collision queries. */
export class Landmarks {
  readonly group = new Group();
  private readonly placed: Placed[];
  private frame: LocalFrame;
  private readonly matrix = new Matrix4();
  private readonly lift = new Matrix4();
  private readonly ecef: Vec3 = [0, 0, 0];

  constructor(frame: LocalFrame) {
    this.frame = frame;
    this.group.name = "landmarks";
    this.placed = ALL.map((spec) => {
      const root = new Object3D();
      root.name = spec.id;
      root.matrixAutoUpdate = false;
      root.add(spec.build());
      const beacons: Object3D[] = [];
      root.traverse((child) => {
        if (child.name === "beacon") {
          beacons.push(child);
        }
      });
      this.group.add(root);
      return { spec, frame: new LocalFrame(spec.lat, spec.lon), root, beacons, base: spec.baseAltitude ?? 0, groundZoom: -1 };
    });
    for (const item of this.placed) {
      this.place(item);
    }
  }

  static exclusions(): Exclusion[] {
    return ALL.filter((spec) => spec.exclusionRadius > 0).map((spec) => ({ lat: spec.lat, lon: spec.lon, radius: spec.exclusionRadius }));
  }

  setFrame(frame: LocalFrame): void {
    this.frame = frame;
    for (const item of this.placed) {
      this.place(item);
    }
  }

  /** Seats landmarks on the best terrain available and hides distant ones. */
  update(terrain: Terrain, cameraLat: number, cameraLon: number, time: number): void {
    for (const item of this.placed) {
      const { spec } = item;
      const dy = (spec.lat - cameraLat) * 111_320;
      const dx = (spec.lon - cameraLon) * 111_320 * Math.cos((cameraLat * Math.PI) / 180);
      const near = Math.hypot(dx, dy) < DRAW_DISTANCE;
      if (spec.baseAltitude === null && near) {
        const ground = terrain.sample(spec.lat, spec.lon);
        if (ground && ground.zoom > item.groundZoom) {
          item.base = ground.height;
          item.groundZoom = ground.zoom;
          this.place(item);
        }
      }
      // Hidden until it has somewhere to stand.
      item.root.visible = near && (spec.baseAltitude !== null || item.groundZoom >= 0);
      for (const beacon of item.beacons) {
        beacon.visible = Math.floor(time * 1.1) % 2 === 0;
      }
    }
  }

  /** The landmark a scene point is inside, if any. */
  collision(frame: LocalFrame, x: number, y: number, z: number): string | null {
    frame.toEcef(x, y, z, this.ecef);
    for (const item of this.placed) {
      const local = item.frame.fromEcef(this.ecef);
      if (Math.abs(local[0]) > 2_000 || Math.abs(local[2]) > 2_000) {
        continue;
      }
      const ly = local[1] - item.base;
      for (const c of item.spec.colliders) {
        if (ly < c.bottom || ly > c.top) {
          continue;
        }
        if (c.kind === "cylinder") {
          if (Math.hypot(local[0] - c.x, local[2] - c.z) < c.radius) {
            return item.spec.name;
          }
        } else {
          const [bx, bz] = rotateYaw(local[0] - c.x, local[2] - c.z, -c.yaw);
          if (Math.abs(bx) < c.halfX && Math.abs(bz) < c.halfZ) {
            return item.spec.name;
          }
        }
      }
    }
    return null;
  }

  /** Altitude of a landable surface (a bridge deck) under a geodetic point, if it's just below it. */
  surfaceUnder(lat: number, lon: number, alt: number): number | null {
    toEcef(lat, lon, alt, this.ecef);
    for (const item of this.placed) {
      if (!item.spec.surfaces || Math.abs(item.spec.lat - lat) > 0.03 || Math.abs(item.spec.lon - lon) > 0.04) {
        continue;
      }
      for (const surface of item.spec.surfaces) {
        const local = item.frame.fromEcef(this.ecef);
        const [sx, sz] = rotateYaw(local[0] - surface.x, local[2] - surface.z, -surface.yaw);
        const top = item.base + surface.top;
        if (Math.abs(sx) < surface.halfX && Math.abs(sz) < surface.halfZ && alt > top - 1.5) {
          return top;
        }
      }
    }
    return null;
  }

  private place(item: Placed): void {
    this.matrix.fromArray(this.frame.matrixFrom(item.frame));
    this.lift.makeTranslation(0, item.base, 0);
    item.root.matrix.multiplyMatrices(this.matrix, this.lift);
    item.root.matrixWorldNeedsUpdate = true;
  }
}
