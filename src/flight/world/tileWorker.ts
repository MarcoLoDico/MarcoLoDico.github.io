/// <reference lib="webworker" />
import { VectorTile, type VectorTileFeature, type VectorTileLayer } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { buildTile, Cover, COVER_RASTER, type TileFeatures, type VectorPoint } from "./tileBuilder";
import type { BuiltTile, Exclusion, FailedTile, ToWorker } from "./tileProtocol";

/**
 * Fetches elevation (AWS Terrain Tiles, Terrarium encoding) and OpenStreetMap
 * vector data (OpenFreeMap) for a tile and builds its low-poly geometry off
 * the main thread.
 */

const ELEVATION_URL = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png";
const VECTOR_TILEJSON = "https://tiles.openfreemap.org/planet";
const VECTOR_MAX_ZOOM = 14;

const scope = self as unknown as DedicatedWorkerGlobalScope;
const inFlight = new Map<number, AbortController>();
let exclusions: readonly Exclusion[] = [];
let vectorTemplate: Promise<string | null> | null = null;

function fill(template: string, z: number, x: number, y: number): string {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

function vectorUrlTemplate(): Promise<string | null> {
  vectorTemplate ??= fetch(VECTOR_TILEJSON)
    .then((response) => response.json() as Promise<{ tiles?: string[] }>)
    .then((json) => json.tiles?.[0] ?? null)
    .catch(() => null);
  return vectorTemplate;
}

async function loadElevation(z: number, x: number, y: number, signal: AbortSignal): Promise<Uint8ClampedArray> {
  const response = await fetch(fill(ELEVATION_URL, z, x, y), { signal });
  if (!response.ok) {
    throw new Error(`elevation ${response.status}`);
  }
  const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const canvas = new OffscreenCanvas(256, 256);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("no 2d context");
  }
  ctx.drawImage(bitmap, 0, 0, 256, 256);
  bitmap.close();
  return ctx.getImageData(0, 0, 256, 256).data;
}

async function loadVector(z: number, x: number, y: number, signal: AbortSignal): Promise<VectorTile | null> {
  if (z > VECTOR_MAX_ZOOM) {
    return null;
  }
  const template = await vectorUrlTemplate();
  if (!template) {
    return null;
  }
  try {
    const response = await fetch(fill(template, z, x, y), { signal });
    if (!response.ok) {
      return null;
    }
    return new VectorTile(new PbfReader(new Uint8Array(await response.arrayBuffer())));
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    return null;
  }
}

const LANDCOVER: Record<string, Cover> = {
  wood: Cover.Forest,
  forest: Cover.Forest,
  grass: Cover.Grass,
  farmland: Cover.Farmland,
  wetland: Cover.Wetland,
  sand: Cover.Sand,
  beach: Cover.Sand,
  ice: Cover.Ice,
  rock: Cover.Rock,
};

const LANDUSE: Record<string, Cover> = {
  residential: Cover.Residential,
  suburb: Cover.Residential,
  neighbourhood: Cover.Residential,
  quarter: Cover.Residential,
  commercial: Cover.Commercial,
  industrial: Cover.Commercial,
  retail: Cover.Commercial,
  railway: Cover.Commercial,
  garages: Cover.Commercial,
  school: Cover.Residential,
  university: Cover.Residential,
  college: Cover.Residential,
  hospital: Cover.Commercial,
  cemetery: Cover.Grass,
  park: Cover.Grass,
  pitch: Cover.Grass,
  playground: Cover.Grass,
  stadium: Cover.Grass,
};

const ROADS: Record<string, { minZoom: number; width: number; color: number }> = {
  motorway: { minZoom: 11, width: 26, color: 0x7f8186 },
  trunk: { minZoom: 11, width: 20, color: 0x85878b },
  primary: { minZoom: 12, width: 15, color: 0x8c8e92 },
  secondary: { minZoom: 13, width: 12, color: 0x95979a },
  tertiary: { minZoom: 14, width: 10, color: 0x9a9b9d },
  minor: { minZoom: 14, width: 8, color: 0xa3a4a1 },
};

function features(layer: VectorTileLayer | undefined): VectorTileFeature[] {
  if (!layer) {
    return [];
  }
  return Array.from({ length: layer.length }, (_, i) => layer.feature(i));
}

function stringProp(feature: VectorTileFeature, key: string): string {
  const value = feature.properties[key];
  return typeof value === "string" ? value : "";
}

function numberProp(feature: VectorTileFeature, key: string): number {
  const value = feature.properties[key];
  return typeof value === "number" ? value : 0;
}

/** Paints land cover into a COVER_RASTER² class grid, red channel = class. */
function rasterizeCover(tile: VectorTile | null, z: number): Uint8Array {
  const result = new Uint8Array(COVER_RASTER * COVER_RASTER);
  if (!tile) {
    return result;
  }
  const canvas = new OffscreenCanvas(COVER_RASTER, COVER_RASTER);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return result;
  }
  // Classes are spaced 16 apart so antialiased edges round back to a real class.
  const style = (cls: Cover) => `rgb(${cls * 16},0,0)`;
  const paintPolygons = (feature: VectorTileFeature, cls: Cover) => {
    if (feature.type !== 3) {
      return;
    }
    const scale = COVER_RASTER / feature.extent;
    ctx.beginPath();
    for (const ring of feature.loadGeometry()) {
      ring.forEach((p, i) => {
        if (i === 0) {
          ctx.moveTo(p.x * scale, p.y * scale);
        } else {
          ctx.lineTo(p.x * scale, p.y * scale);
        }
      });
      ctx.closePath();
    }
    ctx.fillStyle = style(cls);
    ctx.fill("evenodd");
  };

  for (const feature of features(tile.layers["landuse"])) {
    const cls = LANDUSE[stringProp(feature, "class")];
    if (cls !== undefined) {
      paintPolygons(feature, cls);
    }
  }
  for (const feature of features(tile.layers["landcover"])) {
    const cls = LANDCOVER[stringProp(feature, "class")] ?? LANDCOVER[stringProp(feature, "subclass")];
    if (cls !== undefined) {
      paintPolygons(feature, cls);
    }
  }
  for (const feature of features(tile.layers["park"])) {
    paintPolygons(feature, Cover.Grass);
  }
  for (const feature of features(tile.layers["aeroway"])) {
    const cls = stringProp(feature, "class");
    if (cls === "aerodrome") {
      paintPolygons(feature, Cover.Airfield);
    }
  }
  for (const feature of features(tile.layers["aeroway"])) {
    const cls = stringProp(feature, "class");
    if (cls === "apron" || cls === "runway" || cls === "taxiway") {
      paintPolygons(feature, Cover.Paved);
    }
  }
  for (const feature of features(tile.layers["water"])) {
    if (stringProp(feature, "brunnel") !== "tunnel") {
      paintPolygons(feature, Cover.Water);
    }
  }
  if (z >= 11) {
    for (const feature of features(tile.layers["waterway"])) {
      const cls = stringProp(feature, "class");
      if (feature.type !== 2 || (cls !== "river" && cls !== "canal")) {
        continue;
      }
      const metersPerPixel = 40_075_000 / 2 ** z / COVER_RASTER;
      ctx.lineWidth = Math.max(1, (cls === "river" ? 35 : 18) / metersPerPixel);
      ctx.strokeStyle = style(Cover.Water);
      const scale = COVER_RASTER / feature.extent;
      ctx.beginPath();
      for (const line of feature.loadGeometry()) {
        line.forEach((p, i) => {
          if (i === 0) {
            ctx.moveTo(p.x * scale, p.y * scale);
          } else {
            ctx.lineTo(p.x * scale, p.y * scale);
          }
        });
      }
      ctx.stroke();
    }
  }
  const pixels = ctx.getImageData(0, 0, COVER_RASTER, COVER_RASTER).data;
  for (let i = 0; i < result.length; i++) {
    result[i] = Math.round((pixels[i * 4] ?? 0) / 16);
  }
  return result;
}

function extractFeatures(tile: VectorTile | null, z: number): TileFeatures | null {
  if (!tile) {
    return null;
  }
  const lines = (feature: VectorTileFeature): VectorPoint[][] =>
    feature.type === 2 ? feature.loadGeometry().map((line) => line.map((p) => ({ x: p.x, y: p.y }))) : [];
  let extent = 4096;
  const runways: VectorPoint[][] = [];
  const taxiways: VectorPoint[][] = [];
  for (const feature of features(tile.layers["aeroway"])) {
    extent = feature.extent;
    const cls = stringProp(feature, "class");
    if (cls === "runway") {
      runways.push(...lines(feature));
    } else if (cls === "taxiway" && z >= 13) {
      taxiways.push(...lines(feature));
    }
  }
  const roads: TileFeatures["roads"][number][] = [];
  for (const feature of features(tile.layers["transportation"])) {
    extent = feature.extent;
    const style = ROADS[stringProp(feature, "class")];
    if (!style || z < style.minZoom || stringProp(feature, "brunnel") === "tunnel") {
      continue;
    }
    for (const line of lines(feature)) {
      roads.push({ width: style.width, color: style.color, line });
    }
  }
  const buildings: TileFeatures["buildings"][number][] = [];
  if (z >= 14) {
    for (const feature of features(tile.layers["building"])) {
      extent = feature.extent;
      if (feature.type !== 3 || stringProp(feature, "hide_3d") === "true") {
        continue;
      }
      const [outer] = feature.loadGeometry();
      if (!outer) {
        continue;
      }
      buildings.push({
        ring: outer.map((p) => ({ x: p.x, y: p.y })),
        height: numberProp(feature, "render_height") || 6,
        minHeight: numberProp(feature, "render_min_height"),
      });
    }
  }
  return { extent, runways, taxiways, roads, buildings };
}

async function build(id: number, z: number, x: number, y: number): Promise<void> {
  const controller = new AbortController();
  inFlight.set(id, controller);
  try {
    const [elevation, vector] = await Promise.all([
      loadElevation(z, x, y, controller.signal),
      loadVector(z, x, y, controller.signal),
    ]);
    if (controller.signal.aborted) {
      return;
    }
    const geometry = buildTile({
      z,
      x,
      y,
      elevation,
      cover: rasterizeCover(vector, z),
      features: extractFeatures(vector, z),
      exclusions,
    });
    const message: BuiltTile = { type: "built", id, z, x, y, ...geometry };
    scope.postMessage(message, [
      geometry.positions.buffer,
      geometry.normals.buffer,
      geometry.colors.buffer,
      geometry.heights.buffer,
      geometry.water.buffer,
      geometry.obstacles.buffer,
    ]);
  } catch (error) {
    if (!controller.signal.aborted) {
      const message: FailedTile = { type: "failed", id, reason: error instanceof Error ? error.message : String(error) };
      scope.postMessage(message);
    }
  } finally {
    inFlight.delete(id);
  }
}

scope.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  if (message.type === "init") {
    exclusions = message.exclusions;
  } else if (message.type === "build") {
    void build(message.id, message.z, message.x, message.y);
  } else {
    inFlight.get(message.id)?.abort();
    inFlight.delete(message.id);
  }
};
