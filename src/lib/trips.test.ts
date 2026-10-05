import { describe, expect, it } from "vitest";
import type { Place, Trip } from "../content/types";
import { groupByTrip, placesOnSameTrip } from "./trips";

const sicily: Trip = { id: "sicily", name: "Sicily", period: "Aug. 2025" };
const japan: Trip = { id: "japan", name: "Japan", period: "2026" };

function placeOn(id: string, trip?: Trip): Place {
  return {
    id,
    category: "travel",
    name: id,
    subtitle: "",
    period: "",
    site: { id, label: id, coordinates: [0, 0] },
    summary: "",
    sections: [],
    tags: [],
    links: [],
    ...(trip && { trip }),
  };
}

const ids = (places: readonly Place[]) => places.map((place) => place.id);

describe("groupByTrip", () => {
  it("groups places by trip in first-seen order", () => {
    const groups = groupByTrip([placeOn("taormina", sicily), placeOn("kyoto", japan), placeOn("palermo", sicily)]);

    expect(groups.map((group) => group.trip?.id)).toEqual(["sicily", "japan"]);
    expect(groups.map((group) => ids(group.places))).toEqual([["taormina", "palermo"], ["kyoto"]]);
  });

  it("collects places without a trip into one ungrouped group", () => {
    const groups = groupByTrip([placeOn("home"), placeOn("taormina", sicily), placeOn("cottage")]);

    expect(groups.map((group) => group.trip)).toEqual([null, sicily]);
    expect(ids(groups[0]?.places ?? [])).toEqual(["home", "cottage"]);
  });
});

describe("placesOnSameTrip", () => {
  const taormina = placeOn("taormina", sicily);
  const places = [taormina, placeOn("palermo", sicily), placeOn("kyoto", japan), placeOn("home")];

  it("lists the other stops on the trip", () => {
    expect(ids(placesOnSameTrip(taormina, places))).toEqual(["palermo"]);
  });

  it("is empty for a place that is not on a trip", () => {
    expect(placesOnSameTrip(placeOn("home"), places)).toEqual([]);
  });
});
