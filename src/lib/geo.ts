import type { LngLat, Place } from "../content/types";

export interface PositionedPlace {
  readonly place: Place;
  readonly position: LngLat;
}

export interface Bounds {
  readonly southwest: LngLat;
  readonly northeast: LngLat;
}

const METERS_PER_DEGREE_LATITUDE = 111_320;
const SPREAD_RADIUS_METERS = 110;
const AREA_RING_SEGMENTS = 64;
const CARDINAL_ANGLES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] as const;

function coordinateKey([longitude, latitude]: LngLat): string {
  return `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
}

function offsetByMeters([longitude, latitude]: LngLat, eastMeters: number, northMeters: number): LngLat {
  const metersPerDegreeLongitude = METERS_PER_DEGREE_LATITUDE * Math.cos((latitude * Math.PI) / 180);
  return [longitude + eastMeters / metersPerDegreeLongitude, latitude + northMeters / METERS_PER_DEGREE_LATITUDE];
}

/** `angle` is measured clockwise from north, in radians. */
function pointOnCircle(center: LngLat, radiusMeters: number, angle: number): LngLat {
  return offsetByMeters(center, radiusMeters * Math.sin(angle), radiusMeters * Math.cos(angle));
}

/** A closed GeoJSON-style ring (first point repeated last) tracing a circle on the ground. */
export function circleRing(center: LngLat, radiusMeters: number): LngLat[] {
  return Array.from({ length: AREA_RING_SEGMENTS + 1 }, (_, index) =>
    pointOnCircle(center, radiusMeters, (2 * Math.PI * (index % AREA_RING_SEGMENTS)) / AREA_RING_SEGMENTS),
  );
}

/** The points a place covers on the map: its pin, plus the edge of its area when the site is approximate. */
export function footprintOf({ place, position }: PositionedPlace): LngLat[] {
  const { coordinates, radiusMeters } = place.site;
  if (radiusMeters === undefined) {
    return [position];
  }
  return [position, ...CARDINAL_ANGLES.map((angle) => pointOnCircle(coordinates, radiusMeters, angle))];
}

/**
 * Places that share a site would render as one stacked pin, so each group is
 * fanned out on a small ring around the site. The order is stable so pins
 * never jump between renders.
 */
export function spreadColocatedPlaces(places: readonly Place[]): PositionedPlace[] {
  const groups = new Map<string, Place[]>();
  for (const place of places) {
    const key = coordinateKey(place.site.coordinates);
    groups.set(key, [...(groups.get(key) ?? []), place]);
  }

  return [...groups.values()].flatMap((group) => {
    if (group.length === 1) {
      return group.map((place) => ({ place, position: place.site.coordinates }));
    }

    return group.map((place, index) => {
      const angle = (2 * Math.PI * index) / group.length - Math.PI / 2;
      return {
        place,
        position: offsetByMeters(
          place.site.coordinates,
          SPREAD_RADIUS_METERS * Math.cos(angle),
          -SPREAD_RADIUS_METERS * Math.sin(angle),
        ),
      };
    });
  });
}

export function boundsOf(positions: readonly LngLat[]): Bounds | undefined {
  const [first, ...rest] = positions;
  if (!first) {
    return undefined;
  }

  let [west, south] = first;
  let [east, north] = first;
  for (const [longitude, latitude] of rest) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }

  return { southwest: [west, south], northeast: [east, north] };
}
