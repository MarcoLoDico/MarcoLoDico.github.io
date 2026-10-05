import { describe, expect, it } from "vitest";
import type { LngLat, Place, Site } from "../content/types";
import { boundsOf, circleRing, footprintOf, spreadColocatedPlaces } from "./geo";

const site: Site = { id: "campus", label: "Campus", coordinates: [-80.5, 43.5] };

function placeAt(id: string, placeSite: Site = site): Place {
  return {
    id,
    category: "projects",
    name: id,
    subtitle: "",
    period: "",
    site: placeSite,
    summary: "",
    sections: [],
    tags: [],
    links: [],
  };
}

describe("spreadColocatedPlaces", () => {
  it("leaves a place alone when it is the only one at its site", () => {
    const [only] = spreadColocatedPlaces([placeAt("solo")]);
    expect(only?.position).toEqual(site.coordinates);
  });

  it("fans co-located places out to distinct, nearby positions", () => {
    const positioned = spreadColocatedPlaces([placeAt("a"), placeAt("b"), placeAt("c")]);
    const keys = new Set(positioned.map(({ position }) => position.join(",")));

    expect(keys.size).toBe(3);
    for (const { position } of positioned) {
      expect(Math.abs(position[0] - site.coordinates[0])).toBeLessThan(0.01);
      expect(Math.abs(position[1] - site.coordinates[1])).toBeLessThan(0.01);
    }
  });

  it("is deterministic", () => {
    const input = [placeAt("a"), placeAt("b")];
    expect(spreadColocatedPlaces(input)).toEqual(spreadColocatedPlaces(input));
  });
});

function distanceInMeters([longitudeA, latitudeA]: LngLat, [longitudeB, latitudeB]: LngLat): number {
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude = metersPerDegreeLatitude * Math.cos((latitudeA * Math.PI) / 180);
  return Math.hypot((longitudeB - longitudeA) * metersPerDegreeLongitude, (latitudeB - latitudeA) * metersPerDegreeLatitude);
}

describe("circleRing", () => {
  it("is a closed ring whose points all sit on the radius", () => {
    const ring = circleRing(site.coordinates, 450);

    expect(ring.at(0)).toEqual(ring.at(-1));
    for (const point of ring) {
      expect(distanceInMeters(site.coordinates, point)).toBeCloseTo(450, 0);
    }
  });
});

describe("footprintOf", () => {
  it("is just the pin for an exact site", () => {
    expect(footprintOf({ place: placeAt("exact"), position: site.coordinates })).toEqual([site.coordinates]);
  });

  it("reaches the edge of an approximate area in every direction", () => {
    const area: Site = { ...site, radiusMeters: 450 };
    const bounds = boundsOf(footprintOf({ place: placeAt("area", area), position: area.coordinates }));

    expect(bounds && distanceInMeters(site.coordinates, bounds.northeast)).toBeCloseTo(450 * Math.SQRT2, 0);
    expect(bounds && distanceInMeters(site.coordinates, bounds.southwest)).toBeCloseTo(450 * Math.SQRT2, 0);
  });
});

describe("boundsOf", () => {
  it("is undefined for no positions", () => {
    expect(boundsOf([])).toBeUndefined();
  });

  it("encloses every position", () => {
    expect(
      boundsOf([
        [-80, 43],
        [-79, 44],
        [-81, 42.5],
      ]),
    ).toEqual({ southwest: [-81, 42.5], northeast: [-79, 44] });
  });
});
