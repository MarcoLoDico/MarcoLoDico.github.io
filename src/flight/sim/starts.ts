import { flightStartId, isFlyable } from "../../content/flight";
import { places } from "../../content/places";
import type { Place } from "../../content/types";
import { offsetLatLon } from "./geo";

export type StartGroup = "airports" | "scenic" | "places";

export interface Start {
  readonly id: string;
  readonly group: StartGroup;
  readonly name: string;
  readonly detail: string;
  readonly lat: number;
  readonly lon: number;
  /** True heading in degrees. */
  readonly heading: number;
  /**
   * Omitted for a runway start. Otherwise airspeed (kt) and either a fixed
   * altitude above sea level or a height above the ground once it has loaded (m).
   */
  readonly airborne?: { readonly speedKt: number; readonly altitude?: number; readonly aboveGround?: number };
}

export const START_GROUPS: readonly { readonly id: StartGroup; readonly label: string }[] = [
  { id: "places", label: "Places I've worked and studied" },
  { id: "airports", label: "Airports" },
  { id: "scenic", label: "Sightseeing" },
];

/** A runway start: lined up a little past the threshold, facing down the runway. */
function runway(id: string, name: string, detail: string, threshold: { lat: number; lon: number }, heading: number): Start {
  const { lat, lon } = offsetLatLon(threshold, heading, 70);
  return { id, group: "airports", name, detail, lat, lon, heading };
}

/** Three kilometres out and 600 m up, pointed straight at the place. */
function placeStart(place: Place): Start {
  const [lon, lat] = place.site.coordinates;
  const approachFrom = 225;
  const from = offsetLatLon({ lat, lon }, approachFrom, 3_000);
  return {
    id: flightStartId(place),
    group: "places",
    name: place.name,
    detail: place.site.label,
    ...from,
    heading: (approachFrom + 180) % 360,
    airborne: { speedKt: 95, aboveGround: 600 },
  };
}

// Thresholds and headings come from the OpenStreetMap runway centrelines.
export const STARTS: readonly Start[] = [
  ...places.filter(isFlyable).map(placeStart),
  runway("cytz", "Toronto · Billy Bishop", "Runway 26 · CYTZ", { lat: 43.63098, lon: -79.38908 }, 251.2),
  runway("cnc3", "Brampton-Caledon", "Runway 14 · CNC3", { lat: 43.76329, lon: -79.87791 }, 136.3),
  runway("cykf", "Waterloo · Region of Waterloo", "Runway 26 · CYKF", { lat: 43.46603, lon: -80.36581 }, 245.1),
  runway("ksfo", "San Francisco · SFO", "Runway 28L · KSFO", { lat: 37.61209, lon: -122.35926 }, 297.9),
  {
    id: "toronto-air",
    group: "scenic",
    name: "Toronto skyline",
    detail: "2,000 ft over the lake, toward the CN Tower",
    ...offsetLatLon({ lat: 43.6426, lon: -79.3871 }, 215, 6_000),
    heading: 35,
    airborne: { altitude: 610, speedKt: 100 },
  },
  {
    id: "waterloo-air",
    group: "scenic",
    name: "Waterloo campus",
    detail: "2,500 ft, inbound to the University of Waterloo",
    ...offsetLatLon({ lat: 43.4715, lon: -80.5425 }, 225, 5_000),
    heading: 45,
    airborne: { altitude: 760, speedKt: 100 },
  },
  {
    id: "golden-gate-air",
    group: "scenic",
    name: "Golden Gate",
    detail: "1,500 ft off the coast, heading for the bridge",
    ...offsetLatLon({ lat: 37.8197, lon: -122.4787 }, 265, 5_000),
    heading: 85,
    airborne: { altitude: 460, speedKt: 100 },
  },
];

export function findStart(id: string | null): Start | undefined {
  return STARTS.find((start) => start.id === id);
}
