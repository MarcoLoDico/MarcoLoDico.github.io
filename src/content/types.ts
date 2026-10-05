import type { Picture } from "vite-imagetools";

export type CategoryId = "experience" | "projects" | "education" | "other-work" | "travel";

export type LngLat = readonly [longitude: number, latitude: number];

export interface Site {
  readonly id: string;
  readonly label: string;
  readonly coordinates: LngLat;
  /** Marks the site as an approximate area around `coordinates` rather than an exact spot. */
  readonly radiusMeters?: number;
}

export interface Link {
  readonly label: string;
  readonly href: string;
}

export interface Highlight {
  readonly text: string;
  readonly link?: Link;
}

export interface Role {
  readonly title: string;
  readonly period: string;
  readonly highlights: readonly Highlight[];
}

export interface Fact {
  readonly label: string;
  readonly value: string;
}

export type PlaceSection =
  | { readonly kind: "roles"; readonly roles: readonly Role[] }
  | { readonly kind: "highlights"; readonly title: string; readonly highlights: readonly Highlight[] }
  | { readonly kind: "facts"; readonly facts: readonly Fact[] };

export interface Photo {
  readonly picture: Picture;
  readonly alt: string;
  readonly caption?: string;
}

/** A journey that groups several travel places, such as the stops on one holiday. */
export interface Trip {
  readonly id: string;
  readonly name: string;
  readonly period: string;
}

export interface Place {
  readonly id: string;
  readonly category: CategoryId;
  readonly name: string;
  readonly subtitle: string;
  readonly period: string;
  readonly site: Site;
  readonly summary: string;
  readonly sections: readonly PlaceSection[];
  readonly tags: readonly string[];
  readonly links: readonly Link[];
  readonly featured?: boolean;
  /** The first photo is the place's cover on the map and in its details. */
  readonly photos?: readonly Photo[];
  readonly trip?: Trip;
}
