import type { LngLat } from "../content/types";
import type { Bounds } from "../lib/geo";
import type { MapPadding } from "./padding";

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface FittedCamera {
  readonly center: LngLat;
  readonly zoom: number;
}

const TILE_SIZE = 512;

function mercatorX(longitude: number): number {
  return (longitude + 180) / 360;
}

function mercatorY(latitude: number): number {
  const radians = (latitude * Math.PI) / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2;
}

function longitudeFromMercator(x: number): number {
  return x * 360 - 180;
}

function latitudeFromMercator(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

function zoomToFit(availablePixels: number, worldFraction: number, maxZoom: number): number {
  return worldFraction > 0 ? Math.log2(availablePixels / (worldFraction * TILE_SIZE)) : maxZoom;
}

/**
 * Frames bounds inside the padded viewport using Web Mercator scale, which is
 * what MapLibre's globe renders at regional zooms. MapLibre's own globe
 * `cameraForBounds` over-zooms by a latitude-dependent amount, cropping the
 * edges of the bounds.
 */
export function fitBoundsCamera(bounds: Bounds, viewport: Viewport, padding: MapPadding, maxZoom: number): FittedCamera {
  const [west, south] = bounds.southwest;
  const [east, north] = bounds.northeast;
  const left = mercatorX(west);
  const right = mercatorX(east);
  const top = mercatorY(north);
  const bottom = mercatorY(south);

  const availableWidth = Math.max(viewport.width - padding.left - padding.right, 1);
  const availableHeight = Math.max(viewport.height - padding.top - padding.bottom, 1);
  const zoom = Math.min(
    zoomToFit(availableWidth, right - left, maxZoom),
    zoomToFit(availableHeight, bottom - top, maxZoom),
    maxZoom,
  );

  return {
    center: [longitudeFromMercator((left + right) / 2), latitudeFromMercator((top + bottom) / 2)],
    zoom,
  };
}
