import type { Map as MapLibreMap } from "maplibre-gl";
import type { LngLat } from "../content/types";
import { boundsOf, footprintOf } from "../lib/geo";
import { prefersReducedMotion } from "../lib/motion";
import type { CameraIntent } from "./camera";
import { CLUSTER_MAX_ZOOM } from "./mapStyle";
import { fitBoundsCamera } from "./fitBounds";
import type { MapPadding } from "./padding";
import { placesInCategory, positionOf } from "./placePositions";

/** Past the clustering threshold so a focused place is never hidden inside a cluster. */
const PLACE_ZOOM = CLUSTER_MAX_ZOOM + 1.2;
const OVERVIEW_MAX_ZOOM = CLUSTER_MAX_ZOOM + 1.5;
const OVERVIEW_MARGIN_PIXELS = 72;
const CLUSTER_EXPANSION_CUSHION = 0.4;
const INTRO_DURATION_MS = 4800;
const INTRO_CURVE = 1.6;
const GLOBE_ZOOM = 1.4;

export const INITIAL_GLOBE_VIEW: { readonly center: LngLat; readonly zoom: number } = { center: [-38, 28], zoom: 1.2 };

function withMargin(padding: MapPadding, margin: number): MapPadding {
  return {
    top: padding.top + margin,
    right: padding.right + margin,
    bottom: padding.bottom + margin,
    left: padding.left + margin,
  };
}

function motionOptions(isIntro: boolean): { animate: boolean; essential: true; duration?: number; curve?: number } {
  const animate = !prefersReducedMotion();
  return isIntro && animate
    ? { animate, essential: true, duration: INTRO_DURATION_MS, curve: INTRO_CURVE }
    : { animate, essential: true };
}

/**
 * Padding is always passed explicitly so the camera frames content in the
 * part of the map not covered by the panel, even when the panel and the
 * camera change in the same interaction.
 */
export function moveCameraTo(map: MapLibreMap, intent: CameraIntent, padding: MapPadding, isIntro: boolean): void {
  if (intent.kind === "place") {
    const position = positionOf(intent.placeId);
    if (position) {
      map.flyTo({
        center: [...position],
        zoom: Math.max(map.getZoom(), PLACE_ZOOM),
        padding,
        ...motionOptions(isIntro),
      });
    }
    return;
  }

  const bounds = boundsOf(placesInCategory(intent.categoryId).flatMap(footprintOf));
  if (bounds) {
    const container = map.getContainer();
    const camera = fitBoundsCamera(
      bounds,
      { width: container.clientWidth, height: container.clientHeight },
      withMargin(padding, OVERVIEW_MARGIN_PIXELS),
      OVERVIEW_MAX_ZOOM,
    );
    map.flyTo({
      center: [...camera.center],
      zoom: camera.zoom,
      padding,
      bearing: 0,
      pitch: 0,
      ...motionOptions(isIntro),
    });
  }
}

export function flyToGlobe(map: MapLibreMap, padding: MapPadding): void {
  map.flyTo({ center: map.getCenter(), zoom: GLOBE_ZOOM, bearing: 0, pitch: 0, padding, ...motionOptions(false) });
}

export function expandCluster(map: MapLibreMap, center: LngLat, expansionZoom: number, padding: MapPadding): void {
  map.easeTo({
    center: [...center],
    zoom: expansionZoom + CLUSTER_EXPANSION_CUSHION,
    padding,
    ...motionOptions(false),
  });
}

export function easePadding(map: MapLibreMap, padding: MapPadding): void {
  if (map.isMoving()) {
    return;
  }
  map.easeTo({ padding, ...motionOptions(false), duration: 300 });
}
