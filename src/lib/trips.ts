import type { Place, Trip } from "../content/types";

export interface PlaceGroup {
  /** `null` collects places that are not part of any trip. */
  readonly trip: Trip | null;
  readonly places: readonly Place[];
}

/** Groups places by trip, keeping groups and their places in their original order. */
export function groupByTrip(places: readonly Place[]): PlaceGroup[] {
  const groups = new Map<string | null, { trip: Trip | null; places: Place[] }>();
  for (const place of places) {
    const trip = place.trip ?? null;
    const key = trip?.id ?? null;
    const group = groups.get(key);
    if (group) {
      group.places.push(place);
    } else {
      groups.set(key, { trip, places: [place] });
    }
  }
  return [...groups.values()];
}

export function placesOnSameTrip(place: Place, places: readonly Place[]): Place[] {
  const tripId = place.trip?.id;
  return tripId === undefined ? [] : places.filter((other) => other.trip?.id === tripId && other.id !== place.id);
}
