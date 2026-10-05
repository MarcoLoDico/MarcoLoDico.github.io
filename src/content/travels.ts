import { photo } from "./photos";
import type { LngLat, Photo, Place, Trip } from "./types";

interface TripStop {
  readonly id: string;
  readonly name: string;
  /** Where the stop is, broader than its name, such as "Sicily, Italy". */
  readonly region: string;
  readonly coordinates: LngLat;
  readonly summary: string;
  readonly photos: readonly Photo[];
}

interface TripItinerary {
  readonly trip: Trip;
  readonly stops: readonly TripStop[];
}

function placesOnTrip({ trip, stops }: TripItinerary): Place[] {
  return stops.map((stop) => ({
    id: stop.id,
    category: "travel",
    name: stop.name,
    subtitle: `${trip.name} trip`,
    period: trip.period,
    site: { id: stop.id, label: stop.region, coordinates: stop.coordinates },
    summary: stop.summary,
    sections: [],
    tags: [],
    links: [],
    photos: stop.photos,
    trip,
  }));
}

const sicily: TripItinerary = {
  trip: { id: "sicily-2025", name: "Sicily", period: "Aug. 2025" },
  stops: [
    {
      id: "taormina",
      name: "Taormina",
      region: "Sicily, Italy",
      coordinates: [15.2923, 37.8524],
      summary: "A hilltop town on Sicily’s east coast, above the Ionian Sea and in view of Mount Etna.",
      photos: [
        {
          picture: photo("taormina-teatro-antico.jpg"),
          alt: "The ruined brick walls of Taormina’s ancient theatre, with the town and a rocky peak behind it",
          caption: "Teatro Antico di Taormina",
        },
      ],
    },
  ],
};

export const travels: readonly Place[] = [sicily].flatMap(placesOnTrip);
