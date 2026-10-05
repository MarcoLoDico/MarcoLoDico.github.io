import type { Map as MapLibreMap, PositionAnchor } from "maplibre-gl";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LngLat } from "../content/types";
import { Marker } from "./maplibre";

interface MapMarkerProps {
  readonly map: MapLibreMap;
  readonly position: LngLat;
  readonly anchor: PositionAnchor;
  readonly elevated?: boolean;
  readonly children: ReactNode;
}

/** Hosts React content inside a MapLibre marker so it tracks the map natively. */
export function MapMarker({ map, position, anchor, elevated = false, children }: MapMarkerProps) {
  const [element] = useState(() => document.createElement("div"));
  const [marker] = useState(() => new Marker({ element, anchor, opacityWhenCovered: 0 }).setLngLat([...position]));
  const [longitude, latitude] = position;

  useEffect(() => {
    marker.addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, marker]);

  useEffect(() => {
    marker.setLngLat([longitude, latitude]);
  }, [marker, longitude, latitude]);

  useEffect(() => {
    element.classList.toggle("map-marker--elevated", elevated);
  }, [element, elevated]);

  return createPortal(children, element);
}
