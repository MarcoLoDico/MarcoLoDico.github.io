import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap, SkySpecification } from "maplibre-gl";
import { categories, getCategory } from "../content/categories";
import { circleRing, type PositionedPlace } from "../lib/geo";
import type { Theme } from "../hooks/useTheme";

export const PLACES_SOURCE_ID = "explorer-places";
const PLACES_LAYER_ID = "explorer-places-index";
const AREAS_SOURCE_ID = "explorer-areas";
const AREAS_FILL_LAYER_ID = "explorer-areas-fill";
const AREAS_OUTLINE_LAYER_ID = "explorer-areas-outline";

export const CLUSTER_MAX_ZOOM = 15;
const CLUSTER_RADIUS_PIXELS = 56;

export const MAP_STYLE_URLS: Record<Theme, string> = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/fiord",
};

const SKIES: Record<Theme, SkySpecification> = {
  light: {
    "sky-color": "#7fb4ff",
    "horizon-color": "#d9ecff",
    "fog-color": "#eef5ff",
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.5,
    "fog-ground-blend": 0.6,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 8, 0],
  },
  dark: {
    "sky-color": "#1b2a4a",
    "horizon-color": "#31508a",
    "fog-color": "#0e1626",
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.5,
    "fog-ground-blend": 0.6,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 8, 0],
  },
};

export type PlaceFeatureCollection = FeatureCollection<Point, PlaceFeatureProperties>;

export interface PlaceFeatureProperties {
  readonly placeId: string;
  readonly category: string;
}

export function toFeatureCollection(places: readonly PositionedPlace[]): PlaceFeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map(({ place, position }) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [...position] },
      properties: { placeId: place.id, category: place.category },
    })),
  };
}

export interface AreaFeatureProperties {
  readonly color: string;
  readonly emphasized: boolean;
}

export type AreaFeatureCollection = FeatureCollection<Polygon, AreaFeatureProperties>;

export interface ExplorerData {
  readonly places: PlaceFeatureCollection;
  readonly areas: AreaFeatureCollection;
}

/** One area per approximate site and category, so places sharing an area don't stack their fills. */
export function toAreaFeatureCollection(
  places: readonly PositionedPlace[],
  emphasizedPlaceIds: ReadonlySet<string>,
): AreaFeatureCollection {
  const areas = new Map<string, Feature<Polygon, AreaFeatureProperties>>();
  for (const { place } of places) {
    const { site } = place;
    if (site.radiusMeters === undefined) {
      continue;
    }
    const key = `${site.id}:${place.category}`;
    const emphasized = emphasizedPlaceIds.has(place.id) || (areas.get(key)?.properties.emphasized ?? false);
    areas.set(key, {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [circleRing(site.coordinates, site.radiusMeters).map((point) => [...point])] },
      properties: { color: getCategory(place.category).color, emphasized },
    });
  }
  return { type: "FeatureCollection", features: [...areas.values()] };
}

/** Per-category leaf counts on each cluster, used to paint the cluster's category ring. */
const clusterCategoryCounts = Object.fromEntries(
  categories.map((category): [string, [unknown, unknown]] => [
    category.id,
    ["+", ["case", ["==", ["get", "category"], category.id], 1, 0]],
  ]),
);

/**
 * Pins are DOM markers, but clustering is delegated to MapLibre's worker. The
 * index layer is invisible; it only exists so the source's tiles get loaded
 * and can be read back with `querySourceFeatures`.
 */
export function installExplorerLayers(map: MapLibreMap, data: ExplorerData, theme: Theme): void {
  map.setProjection({ type: "globe" });
  map.setSky(SKIES[theme]);
  installAreaLayers(map, data.areas);

  if (!map.getSource(PLACES_SOURCE_ID)) {
    map.addSource(PLACES_SOURCE_ID, {
      type: "geojson",
      data: data.places,
      cluster: true,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterRadius: CLUSTER_RADIUS_PIXELS,
      clusterProperties: clusterCategoryCounts,
    });
  }

  if (!map.getLayer(PLACES_LAYER_ID)) {
    map.addLayer({
      id: PLACES_LAYER_ID,
      type: "circle",
      source: PLACES_SOURCE_ID,
      paint: { "circle-radius": 1, "circle-opacity": 0, "circle-stroke-opacity": 0 },
    });
  }
}

/** Areas sit beneath the basemap's labels so street and building names stay readable through them. */
function installAreaLayers(map: MapLibreMap, data: AreaFeatureCollection): void {
  if (!map.getSource(AREAS_SOURCE_ID)) {
    map.addSource(AREAS_SOURCE_ID, { type: "geojson", data });
  }

  const beforeLabels = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
  if (!map.getLayer(AREAS_FILL_LAYER_ID)) {
    map.addLayer(
      {
        id: AREAS_FILL_LAYER_ID,
        type: "fill",
        source: AREAS_SOURCE_ID,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["case", ["get", "emphasized"], 0.24, 0.14],
        },
      },
      beforeLabels,
    );
  }
  if (!map.getLayer(AREAS_OUTLINE_LAYER_ID)) {
    map.addLayer(
      {
        id: AREAS_OUTLINE_LAYER_ID,
        type: "line",
        source: AREAS_SOURCE_ID,
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["case", ["get", "emphasized"], 2.5, 1.5],
          "line-opacity": ["case", ["get", "emphasized"], 0.8, 0.45],
          "line-blur": 1,
        },
      },
      beforeLabels,
    );
  }
}

export function updatePlaceData(map: MapLibreMap, data: PlaceFeatureCollection): void {
  void map.getSource<GeoJSONSource>(PLACES_SOURCE_ID)?.setData(data);
}

export function updateAreaData(map: MapLibreMap, data: AreaFeatureCollection): void {
  void map.getSource<GeoJSONSource>(AREAS_SOURCE_ID)?.setData(data);
}
