import { places } from "../content/places";
import type { CategoryId, LngLat } from "../content/types";
import { spreadColocatedPlaces, type PositionedPlace } from "../lib/geo";

/** Computed once over every place so pins keep their spot when filters change. */
export const positionedPlaces: readonly PositionedPlace[] = spreadColocatedPlaces(places);

const positionsById: ReadonlyMap<string, LngLat> = new Map(
  positionedPlaces.map(({ place, position }) => [place.id, position]),
);

export function positionOf(placeId: string): LngLat | undefined {
  return positionsById.get(placeId);
}

export function placesInCategory(categoryId: CategoryId | null): readonly PositionedPlace[] {
  return categoryId === null
    ? positionedPlaces
    : positionedPlaces.filter(({ place }) => place.category === categoryId);
}
