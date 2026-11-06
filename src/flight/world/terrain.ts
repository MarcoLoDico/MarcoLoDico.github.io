import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshLambertMaterial } from "three";
import { LocalFrame, lonLatToTileXY, tileKey, tileWidthMeters, tileXToLon, tileYToLat, type TileId } from "../sim/geo";
import { GRID, type BuiltTile, type Exclusion, type FromWorker, type ToWorker } from "./tileProtocol";

const MIN_ZOOM = 5;
const MAX_ZOOM = 14;
/** A tile splits into its four children when the camera is closer than this many tile widths. */
const SPLIT_DISTANCE = 1.9;
/** Nothing beyond this is drawn; fog has hidden it by then. */
const VIEW_DISTANCE = 190_000;
const MAX_IN_FLIGHT = 8;
const MAX_CACHED = 420;

interface TileEntry {
  readonly id: number;
  readonly tile: TileId;
  readonly key: string;
  state: "loading" | "ready" | "failed";
  readonly frame: LocalFrame;
  mesh: Mesh | null;
  heights: Float32Array | null;
  water: Uint8Array | null;
  obstacles: Float32Array | null;
  lastUsed: number;
  failedAt: number;
}

export interface GroundSample {
  /** Metres above sea level. */
  height: number;
  water: boolean;
  /** Ground slope as metres of rise per metre east and north. */
  slopeEast: number;
  slopeNorth: number;
  zoom: number;
}

export interface Obstacle {
  readonly lat: number;
  readonly lon: number;
  readonly radius: number;
  readonly top: number;
  /** Footprint as (east, north) metre offsets from lat/lon, flattened. */
  readonly footprint: Float32Array;
}

/** Whether a point (metres east/north of an obstacle's centre) is inside its footprint. */
export function insideFootprint(obstacle: Obstacle, east: number, north: number): boolean {
  const f = obstacle.footprint;
  const n = f.length / 2;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = f[i * 2] ?? 0;
    const yi = f[i * 2 + 1] ?? 0;
    const xj = f[j * 2] ?? 0;
    const yj = f[j * 2 + 1] ?? 0;
    if (yi > north !== yj > north && east < ((xj - xi) * (north - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Pulls a material's fragments slightly toward the camera in the logarithmic
 * depth buffer: by a fixed fraction of their distance, so the nudge is
 * millimetres up close and metres on the horizon, always enough to win.
 */
function depthNudged<T extends MeshLambertMaterial>(material: T, factor: number): T {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <logdepthbuf_fragment>",
      `#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
        gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth * ${factor.toFixed(5)} ) * logDepthBufFC * 0.5;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => `depth-nudge-${factor}`;
  return material;
}

/**
 * Streams terrain tiles around the camera as a quadtree: big coarse tiles on
 * the horizon, 1.8 km tiles with buildings and trees underneath. Tiles are
 * built in a worker and kept in an LRU cache, and the flight model queries
 * the same triangles it sees for ground contact.
 */
export class Terrain {
  readonly group = new Group();
  private readonly worker: Worker;
  private readonly entries = new Map<string, TileEntry>();
  private readonly byId = new Map<number, TileEntry>();
  private readonly material = new MeshLambertMaterial({ vertexColors: true });
  // Paving and markings sit flush on the ground and win the depth test by a
  // relative nudge, so they never flicker at any distance.
  private readonly pavingMaterial = depthNudged(new MeshLambertMaterial({ vertexColors: true }), 0.9995);
  private readonly markingMaterial = depthNudged(new MeshLambertMaterial({ vertexColors: true }), 0.999);
  private nextId = 1;
  private frameCounter = 0;
  private frame: LocalFrame;
  private wanted: TileId[] = [];
  private inFlight = 0;
  private readonly matrix = new Matrix4();

  constructor(frame: LocalFrame, exclusions: readonly Exclusion[]) {
    this.frame = frame;
    this.group.name = "terrain";
    this.worker = new Worker(new URL("./tileWorker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<FromWorker>) => {
      this.receive(event.data);
    };
    this.post({ type: "init", exclusions });
  }

  dispose(): void {
    this.worker.terminate();
    for (const entry of this.entries.values()) {
      entry.mesh?.geometry.dispose();
    }
    this.material.dispose();
    this.pavingMaterial.dispose();
    this.markingMaterial.dispose();
    this.entries.clear();
  }

  /** Re-anchors every tile mesh to a new scene frame. */
  setFrame(frame: LocalFrame): void {
    this.frame = frame;
    for (const entry of this.entries.values()) {
      if (entry.mesh) {
        this.placeMesh(entry);
      }
    }
  }

  get pending(): number {
    return this.inFlight;
  }

  /** Chooses, requests, and shows tiles for a camera position. */
  update(lat: number, lon: number, heightAboveGround: number): void {
    this.frameCounter++;
    this.wanted = this.selectTiles(lat, lon, Math.max(2, heightAboveGround));
    const wantedKeys = new Set(this.wanted.map(tileKey));

    // Request what's missing, nearest (relative to tile size) first.
    const missing = this.wanted
      .filter((tile) => {
        const entry = this.entries.get(tileKey(tile));
        return !entry || (entry.state === "failed" && performance.now() - entry.failedAt > 8_000);
      })
      .map((tile) => ({ tile, priority: this.distanceTo(tile, lat, lon) / tileWidthMeters(tile) }))
      .sort((a, b) => a.priority - b.priority);
    for (const { tile } of missing) {
      if (this.inFlight >= MAX_IN_FLIGHT) {
        break;
      }
      this.request(tile);
    }
    // Cancel requests nobody needs any more.
    for (const entry of this.entries.values()) {
      if (entry.state === "loading" && !wantedKeys.has(entry.key) && !this.isAncestorOfWanted(entry.tile, wantedKeys)) {
        this.post({ type: "cancel", id: entry.id });
        this.forget(entry);
        this.inFlight = Math.max(0, this.inFlight - 1);
      }
    }

    // Show each wanted tile, or its nearest loaded ancestor while it loads.
    const visible = new Set<string>();
    const covering = new Set<string>();
    for (const tile of this.wanted) {
      const key = tileKey(tile);
      const entry = this.entries.get(key);
      if (entry?.state === "ready") {
        visible.add(key);
        entry.lastUsed = this.frameCounter;
        continue;
      }
      for (let z = tile.z - 1; z >= MIN_ZOOM; z--) {
        const shift = tile.z - z;
        const ancestor = { z, x: tile.x >> shift, y: tile.y >> shift };
        const ancestorEntry = this.entries.get(tileKey(ancestor));
        if (ancestorEntry?.state === "ready") {
          covering.add(ancestorEntry.key);
          ancestorEntry.lastUsed = this.frameCounter;
          break;
        }
      }
    }
    for (const key of covering) {
      visible.add(key);
    }
    for (const key of visible) {
      const entry = this.entries.get(key);
      if (entry && !covering.has(key) && this.hasAncestorIn(entry.tile, covering)) {
        visible.delete(key);
      }
    }
    for (const entry of this.entries.values()) {
      if (entry.mesh) {
        entry.mesh.visible = visible.has(entry.key);
      }
    }
    this.evict(wantedKeys);
  }

  /** Ground under a point from the finest loaded tile, or null if nothing is loaded there yet. */
  sample(lat: number, lon: number): GroundSample | null {
    for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
      const [fx, fy] = lonLatToTileXY(lon, lat, z);
      const x = Math.floor(fx);
      const y = Math.floor(fy);
      const entry = this.entries.get(`${z}/${x}/${y}`);
      if (entry?.state !== "ready" || !entry.heights || !entry.water) {
        continue;
      }
      const n = GRID;
      const stride = n + 1;
      const gx = Math.min(n - 1e-6, Math.max(0, (fx - x) * n));
      const gy = Math.min(n - 1e-6, Math.max(0, (fy - y) * n));
      const i = Math.floor(gx);
      const j = Math.floor(gy);
      const u = gx - i;
      const v = gy - j;
      const h = entry.heights;
      const h00 = h[j * stride + i] ?? 0;
      const h10 = h[j * stride + i + 1] ?? 0;
      const h01 = h[(j + 1) * stride + i] ?? 0;
      const h11 = h[(j + 1) * stride + i + 1] ?? 0;
      const upper = u >= v;
      const dU = upper ? h10 - h00 : h11 - h01;
      const dV = upper ? h11 - h10 : h01 - h00;
      const cellMeters = tileWidthMeters({ z, x, y }) / n;
      return {
        height: upper ? h00 + u * (h10 - h00) + v * (h11 - h10) : h00 + v * (h01 - h00) + u * (h11 - h01),
        water: (entry.water[(j * n + i) * 2 + (upper ? 0 : 1)] ?? 0) === 1,
        slopeEast: dU / cellMeters,
        // Tile rows run southward, so +v is south.
        slopeNorth: -dV / cellMeters,
        zoom: z,
      };
    }
    return null;
  }

  /** Tall buildings near a point, from the detailed tiles. */
  *obstaclesNear(lat: number, lon: number): Generator<Obstacle> {
    const [fx, fy] = lonLatToTileXY(lon, lat, MAX_ZOOM);
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const entry = this.entries.get(`${MAX_ZOOM}/${cx + dx}/${cy + dy}`);
        const list = entry?.obstacles;
        if (!list) {
          continue;
        }
        for (let k = 0; k < list.length; ) {
          const count = list[k] ?? 0;
          yield {
            top: list[k + 1] ?? 0,
            lat: list[k + 2] ?? 0,
            lon: list[k + 3] ?? 0,
            radius: list[k + 4] ?? 0,
            footprint: list.subarray(k + 5, k + 5 + count * 2),
          };
          k += 5 + count * 2;
        }
      }
    }
  }

  private selectTiles(lat: number, lon: number, heightAboveGround: number): TileId[] {
    const result: TileId[] = [];
    const [rx, ry] = lonLatToTileXY(lon, lat, MIN_ZOOM);
    const n = 2 ** MIN_ZOOM;
    const visit = (tile: TileId) => {
      const horizontal = this.distanceTo(tile, lat, lon);
      if (horizontal > VIEW_DISTANCE) {
        return;
      }
      const distance = Math.hypot(horizontal, heightAboveGround);
      if (tile.z < MAX_ZOOM && distance < tileWidthMeters(tile) * SPLIT_DISTANCE) {
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            visit({ z: tile.z + 1, x: tile.x * 2 + dx, y: tile.y * 2 + dy });
          }
        }
      } else {
        result.push(tile);
      }
    };
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const y = Math.floor(ry) + dy;
        if (y >= 0 && y < n) {
          visit({ z: MIN_ZOOM, x: (((Math.floor(rx) + dx) % n) + n) % n, y });
        }
      }
    }
    return result;
  }

  /** Horizontal metres from a point to the nearest edge of a tile (0 inside it). */
  private distanceTo(tile: TileId, lat: number, lon: number): number {
    const west = tileXToLon(tile.x, tile.z);
    const east = tileXToLon(tile.x + 1, tile.z);
    const north = tileYToLat(tile.y, tile.z);
    const south = tileYToLat(tile.y + 1, tile.z);
    const clampedLat = Math.min(north, Math.max(south, lat));
    const clampedLon = Math.min(east, Math.max(west, lon));
    const dy = (lat - clampedLat) * 111_320;
    const dx = (lon - clampedLon) * 111_320 * Math.cos((lat * Math.PI) / 180);
    return Math.hypot(dx, dy);
  }

  private isAncestorOfWanted(tile: TileId, wanted: Set<string>): boolean {
    // Keep coarse tiles loading while they're the fallback for wanted ones.
    for (const key of wanted) {
      const [z = 0, x = 0, y = 0] = key.split("/").map(Number);
      if (z > tile.z && x >> (z - tile.z) === tile.x && y >> (z - tile.z) === tile.y) {
        return true;
      }
    }
    return false;
  }

  private hasAncestorIn(tile: TileId, keys: Set<string>): boolean {
    for (let z = tile.z - 1; z >= MIN_ZOOM; z--) {
      const shift = tile.z - z;
      if (keys.has(`${z}/${tile.x >> shift}/${tile.y >> shift}`)) {
        return true;
      }
    }
    return false;
  }

  private request(tile: TileId): void {
    const key = tileKey(tile);
    const previous = this.entries.get(key);
    if (previous) {
      this.forget(previous);
    }
    const entry: TileEntry = {
      id: this.nextId++,
      tile,
      key,
      state: "loading",
      frame: new LocalFrame(tileYToLat(tile.y + 0.5, tile.z), tileXToLon(tile.x + 0.5, tile.z)),
      mesh: null,
      heights: null,
      water: null,
      obstacles: null,
      lastUsed: this.frameCounter,
      failedAt: 0,
    };
    this.entries.set(key, entry);
    this.byId.set(entry.id, entry);
    this.inFlight++;
    this.post({ type: "build", id: entry.id, z: tile.z, x: tile.x, y: tile.y });
  }

  private receive(message: FromWorker): void {
    const entry = this.byId.get(message.id);
    if (!entry) {
      return;
    }
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (message.type === "failed") {
      entry.state = "failed";
      entry.failedAt = performance.now();
      return;
    }
    this.install(entry, message);
  }

  private install(entry: TileEntry, built: BuiltTile): void {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(built.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(built.normals, 3, true));
    geometry.setAttribute("color", new BufferAttribute(built.colors, 3, true));
    geometry.computeBoundingSphere();
    const vertexCount = built.positions.length / 3;
    geometry.addGroup(0, built.pavingStart, 0);
    geometry.addGroup(built.pavingStart, built.markingStart - built.pavingStart, 1);
    geometry.addGroup(built.markingStart, vertexCount - built.markingStart, 2);
    const mesh = new Mesh(geometry, [this.material, this.pavingMaterial, this.markingMaterial]);
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    mesh.visible = false;
    mesh.name = entry.key;
    entry.mesh = mesh;
    entry.heights = built.heights;
    entry.water = built.water;
    entry.obstacles = built.obstacles;
    entry.state = "ready";
    this.placeMesh(entry);
    this.group.add(mesh);
  }

  private placeMesh(entry: TileEntry): void {
    if (!entry.mesh) {
      return;
    }
    this.matrix.fromArray(this.frame.matrixFrom(entry.frame));
    entry.mesh.matrix.copy(this.matrix);
    entry.mesh.matrixWorldNeedsUpdate = true;
  }

  private forget(entry: TileEntry): void {
    if (entry.mesh) {
      this.group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
    }
    this.entries.delete(entry.key);
    this.byId.delete(entry.id);
  }

  private evict(wanted: Set<string>): void {
    if (this.entries.size <= MAX_CACHED) {
      return;
    }
    const candidates = [...this.entries.values()]
      .filter((entry) => entry.state !== "loading" && !wanted.has(entry.key) && !(entry.mesh?.visible ?? false))
      .sort((a, b) => a.lastUsed - b.lastUsed);
    for (const entry of candidates.slice(0, this.entries.size - MAX_CACHED)) {
      this.forget(entry);
    }
  }

  private post(message: ToWorker): void {
    this.worker.postMessage(message);
  }
}
