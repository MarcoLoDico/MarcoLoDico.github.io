import type { GeoJSONSource } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Place } from "../content/types";
import type { ExplorerState } from "../lib/explorer";
import type { PositionedPlace } from "../lib/geo";
import type { Theme } from "../hooks/useTheme";
import { planCameraIntent } from "./camera";
import { easePadding, expandCluster, flyToGlobe, INITIAL_GLOBE_VIEW, moveCameraTo } from "./cameraMoves";
import { ClusterPin } from "./ClusterPin";
import { MapControls } from "./MapControls";
import { MapLibreMap } from "./maplibre";
import { MapMarker } from "./MapMarker";
import type { MapPadding } from "./padding";
import {
  installExplorerLayers,
  MAP_STYLE_URLS,
  PLACES_SOURCE_ID,
  toAreaFeatureCollection,
  toFeatureCollection,
  updateAreaData,
  updatePlaceData,
} from "./mapStyle";
import { PlacePin } from "./PlacePin";
import { useMarkerSnapshot, type ClusterMarker } from "./useMarkerSnapshot";
import "./map.css";

interface MapViewProps {
  readonly explorer: ExplorerState;
  readonly visiblePlaces: readonly PositionedPlace[];
  readonly hoveredPlaceId: string | null;
  readonly padding: MapPadding;
  readonly theme: Theme;
  readonly onSelectPlace: (place: Place) => void;
  readonly onHoverPlace: (placeId: string | null) => void;
}

const FALLBACK_CLUSTER_ZOOM_STEP = 2;

function emphasizedIds(...placeIds: readonly (string | null)[]): ReadonlySet<string> {
  return new Set(placeIds.filter((placeId) => placeId !== null));
}

export function MapView({
  explorer,
  visiblePlaces,
  hoveredPlaceId,
  padding,
  theme,
  onSelectPlace,
  onHoverPlace,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [bearing, setBearing] = useState(0);
  const snapshot = useMarkerSnapshot(map);

  const placeData = useMemo(() => toFeatureCollection(visiblePlaces), [visiblePlaces]);
  const areaData = useMemo(
    () => toAreaFeatureCollection(visiblePlaces, emphasizedIds(explorer.placeId, hoveredPlaceId)),
    [visiblePlaces, explorer.placeId, hoveredPlaceId],
  );
  const latest = useRef({ data: { places: placeData, areas: areaData }, theme, padding });
  useEffect(() => {
    latest.current = { data: { places: placeData, areas: areaData }, theme, padding };
  }, [placeData, areaData, theme, padding]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const instance = new MapLibreMap({
      container,
      style: MAP_STYLE_URLS[latest.current.theme],
      center: [...INITIAL_GLOBE_VIEW.center],
      zoom: INITIAL_GLOBE_VIEW.zoom,
      attributionControl: { compact: true },
      maxPitch: 70,
    });

    instance.on("style.load", () => {
      installExplorerLayers(instance, latest.current.data, latest.current.theme);
    });
    instance.once("load", () => setMap(instance));
    instance.on("rotate", () => setBearing(instance.getBearing()));

    return () => {
      instance.remove();
    };
  }, []);

  const appliedTheme = useRef(theme);
  useEffect(() => {
    if (!map || appliedTheme.current === theme) {
      return;
    }
    appliedTheme.current = theme;
    map.setStyle(MAP_STYLE_URLS[theme], { diff: false });
  }, [map, theme]);

  useEffect(() => {
    if (map) {
      updatePlaceData(map, placeData);
    }
  }, [map, placeData]);

  useEffect(() => {
    if (map) {
      updateAreaData(map, areaData);
    }
  }, [map, areaData]);

  const { top, right, bottom, left } = padding;
  useEffect(() => {
    if (map) {
      easePadding(map, { top, right, bottom, left });
    }
  }, [map, top, right, bottom, left]);

  const previousExplorer = useRef<ExplorerState | null>(null);
  useEffect(() => {
    if (!map) {
      return;
    }
    const previous = previousExplorer.current;
    previousExplorer.current = explorer;
    const intent = planCameraIntent(previous, explorer);
    if (intent) {
      moveCameraTo(map, intent, latest.current.padding, previous === null);
    }
  }, [map, explorer]);

  const handleExpandCluster = useCallback(
    (cluster: ClusterMarker) => {
      if (!map) {
        return;
      }
      const zoomPastCluster = (zoom: number) => expandCluster(map, cluster.position, zoom, latest.current.padding);
      const source = map.getSource<GeoJSONSource>(PLACES_SOURCE_ID);
      if (!source) {
        return;
      }
      source
        .getClusterExpansionZoom(cluster.clusterId)
        .then(zoomPastCluster)
        .catch(() => zoomPastCluster(map.getZoom() + FALLBACK_CLUSTER_ZOOM_STEP));
    },
    [map],
  );

  const recenter = useCallback(() => {
    const intent = planCameraIntent(null, explorer);
    if (map && intent) {
      moveCameraTo(map, intent, latest.current.padding, false);
    }
  }, [map, explorer]);

  const pinnedPlaces = visiblePlaces.filter(
    ({ place }) => snapshot.unclusteredPlaceIds.has(place.id) || place.id === explorer.placeId,
  );

  return (
    <div className="map-view">
      <div ref={containerRef} className="map-view__canvas" />
      {map && (
        <>
          {snapshot.clusters.map((cluster) => (
            <MapMarker key={`cluster-${cluster.clusterId}`} map={map} position={cluster.position} anchor="center">
              <ClusterPin cluster={cluster} onExpand={handleExpandCluster} />
            </MapMarker>
          ))}
          {pinnedPlaces.map(({ place, position }) => {
            const selected = place.id === explorer.placeId;
            const highlighted = place.id === hoveredPlaceId;
            return (
              <MapMarker key={place.id} map={map} position={position} anchor="bottom" elevated={selected || highlighted}>
                <PlacePin
                  place={place}
                  selected={selected}
                  highlighted={highlighted}
                  onSelect={onSelectPlace}
                  onHover={onHoverPlace}
                />
              </MapMarker>
            );
          })}
          <MapControls
            bearing={bearing}
            onZoomIn={() => map.zoomIn()}
            onZoomOut={() => map.zoomOut()}
            onResetNorth={() => map.resetNorthPitch()}
            onRecenter={recenter}
            onShowGlobe={() => flyToGlobe(map, latest.current.padding)}
          />
        </>
      )}
    </div>
  );
}
