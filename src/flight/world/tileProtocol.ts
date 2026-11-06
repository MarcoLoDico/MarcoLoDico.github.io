/** Messages between the terrain manager and the tile worker. */

export interface Exclusion {
  readonly lat: number;
  readonly lon: number;
  readonly radius: number;
}

export interface TileRequest {
  readonly type: "build";
  readonly id: number;
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

export interface TileCancel {
  readonly type: "cancel";
  readonly id: number;
}

export interface WorkerInit {
  readonly type: "init";
  readonly exclusions: readonly Exclusion[];
}

export type ToWorker = TileRequest | TileCancel | WorkerInit;

/** Vertices per tile edge minus one. */
export const GRID = 32;

export interface BuiltTile {
  readonly type: "built";
  readonly id: number;
  readonly z: number;
  readonly x: number;
  readonly y: number;
  /** Non-indexed triangles in the tile's own local frame (centred on the tile). */
  readonly positions: Float32Array;
  readonly normals: Int8Array;
  readonly colors: Uint8Array;
  /** (GRID+1)² ground heights in metres above sea level, row-major from the tile's north-west corner. */
  readonly heights: Float32Array;
  /** One flag per terrain triangle (two per cell): 1 where it is water. */
  readonly water: Uint8Array;
  /**
   * Buildings for collisions, as records of [vertexCount, bottomAltitude,
   * topAltitude, lat, lon, radius, then vertexCount (east, north) footprint
   * offsets in metres].
   */
  readonly obstacles: Float32Array;
  /** Per-vertex facade coordinates (metres along and up each wall) for the window shader. */
  readonly facades: Float32Array;
  /** Vertex indices where buildings, paving, then runway markings start (separate draw groups). */
  readonly buildingStart: number;
  readonly pavingStart: number;
  readonly runwayStart: number;
  readonly markingStart: number;
}

export interface FailedTile {
  readonly type: "failed";
  readonly id: number;
  readonly reason: string;
}

export type FromWorker = BuiltTile | FailedTile;
