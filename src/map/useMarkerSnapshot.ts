import type { GeoJSONFeature, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useState } from "react";
import { categories } from "../content/categories";
import type { CategoryId, LngLat } from "../content/types";
import { PLACES_SOURCE_ID } from "./mapStyle";

export interface CategoryShare {
  readonly categoryId: CategoryId;
  readonly count: number;
}

export interface ClusterMarker {
  readonly clusterId: number;
  readonly position: LngLat;
  readonly count: number;
  readonly shares: readonly CategoryShare[];
}

/** What the clustering worker says should be on screen right now. */
export interface MarkerSnapshot {
  readonly clusters: readonly ClusterMarker[];
  readonly unclusteredPlaceIds: ReadonlySet<string>;
}

type FeatureProperties = Readonly<Record<string, unknown>>;

const EMPTY_SNAPSHOT: MarkerSnapshot = { clusters: [], unclusteredPlaceIds: new Set() };

function readPosition(feature: GeoJSONFeature): LngLat | undefined {
  if (feature.geometry.type !== "Point") {
    return undefined;
  }
  const [longitude, latitude] = feature.geometry.coordinates;
  return longitude === undefined || latitude === undefined ? undefined : [longitude, latitude];
}

function readNumber(properties: FeatureProperties, key: string): number | undefined {
  const value = properties[key];
  return typeof value === "number" ? value : undefined;
}

function readString(properties: FeatureProperties, key: string): string | undefined {
  const value = properties[key];
  return typeof value === "string" ? value : undefined;
}

function readCluster(properties: FeatureProperties, position: LngLat): ClusterMarker | undefined {
  const clusterId = readNumber(properties, "cluster_id");
  const count = readNumber(properties, "point_count");
  if (clusterId === undefined || count === undefined) {
    return undefined;
  }

  const shares = categories
    .map((category) => ({ categoryId: category.id, count: readNumber(properties, category.id) ?? 0 }))
    .filter((share) => share.count > 0);

  return { clusterId, position, count, shares };
}

function readSnapshot(map: MapLibreMap): MarkerSnapshot {
  const clusters = new Map<number, ClusterMarker>();
  const unclusteredPlaceIds = new Set<string>();

  for (const feature of map.querySourceFeatures(PLACES_SOURCE_ID)) {
    const properties: FeatureProperties = feature.properties;
    const position = readPosition(feature);
    if (!position) {
      continue;
    }

    const placeId = readString(properties, "placeId");
    if (placeId !== undefined) {
      unclusteredPlaceIds.add(placeId);
      continue;
    }

    const cluster = readCluster(properties, position);
    if (cluster) {
      clusters.set(cluster.clusterId, cluster);
    }
  }

  return { clusters: [...clusters.values()], unclusteredPlaceIds };
}

function signatureOf(snapshot: MarkerSnapshot): string {
  const clusterKeys = snapshot.clusters
    .map(({ clusterId, count, position: [longitude, latitude] }) =>
      `${clusterId}:${count}@${longitude.toFixed(5)},${latitude.toFixed(5)}`,
    )
    .sort();
  return `${clusterKeys.join(",")}|${[...snapshot.unclusteredPlaceIds].sort().join(",")}`;
}

/**
 * Reads cluster membership back out of MapLibre after each frame. React state
 * only changes when membership does, so panning and zooming stay off the
 * React render path.
 */
export function useMarkerSnapshot(map: MapLibreMap | null): MarkerSnapshot {
  const [snapshot, setSnapshot] = useState<MarkerSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    if (!map) {
      return;
    }

    let currentSignature = signatureOf(EMPTY_SNAPSHOT);
    const syncSnapshot = () => {
      if (!map.getSource(PLACES_SOURCE_ID) || !map.isSourceLoaded(PLACES_SOURCE_ID)) {
        return;
      }
      const next = readSnapshot(map);
      const nextSignature = signatureOf(next);
      if (nextSignature !== currentSignature) {
        currentSignature = nextSignature;
        setSnapshot(next);
      }
    };

    map.on("render", syncSnapshot);
    return () => {
      map.off("render", syncSnapshot);
    };
  }, [map]);

  return snapshot;
}
