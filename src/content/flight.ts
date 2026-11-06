import type { Place } from "./types";

/** Categories that are real places to fly to; projects are mostly "around campus". */
const FLYABLE_CATEGORIES = new Set<string>(["experience", "education", "other-work"]);

export function isFlyable(place: Place): boolean {
  return FLYABLE_CATEGORIES.has(place.category) && place.site.radiusMeters === undefined;
}

export function flightStartId(place: Place): string {
  return `place-${place.id}`;
}

/** Opens the flight sim with this place preselected as the start. */
export function flightUrl(place: Place): string {
  return `${import.meta.env.BASE_URL}flight/?start=${flightStartId(place)}`;
}
