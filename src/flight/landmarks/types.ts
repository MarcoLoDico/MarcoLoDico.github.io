import type { Object3D } from "three";

/**
 * Landmarks are authored in their own local frame: origin at their base,
 * +x east, +y up, -z north, metres.
 */

export type Collider =
  | { readonly kind: "cylinder"; readonly x: number; readonly z: number; readonly radius: number; readonly bottom: number; readonly top: number }
  | {
      readonly kind: "box";
      readonly x: number;
      readonly z: number;
      readonly halfX: number;
      readonly halfZ: number;
      readonly yaw: number;
      readonly bottom: number;
      readonly top: number;
    };

/** A flat rectangle the aircraft can roll on, like a bridge deck. */
export interface Surface {
  readonly x: number;
  readonly z: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly yaw: number;
  readonly top: number;
}

export interface LandmarkSpec {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  /** OSM buildings within this radius are left out so they don't overlap the model. */
  readonly exclusionRadius: number;
  /** Fixed base altitude in metres, or null to sit on the terrain. */
  readonly baseAltitude: number | null;
  readonly build: () => Object3D;
  readonly colliders: readonly Collider[];
  readonly surfaces?: readonly Surface[];
}

/** Rotates a local point by yaw (radians, counter-clockwise seen from above). */
export function rotateYaw(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}
