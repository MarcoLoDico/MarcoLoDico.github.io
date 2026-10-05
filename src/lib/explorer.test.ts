import { describe, expect, it } from "vitest";
import { findPlace } from "../content/places";
import type { Place } from "../content/types";
import { planCameraIntent } from "../map/camera";
import { explorerReducer, initialExplorerState, parseExplorerState, serializeExplorerState } from "./explorer";

function place(id: string): Place {
  const found = findPlace(id);
  if (!found) {
    throw new Error(`Missing fixture place ${id}`);
  }
  return found;
}

describe("explorerReducer", () => {
  it("keeps showing every place when one is selected from the full map", () => {
    const next = explorerReducer(initialExplorerState, { type: "selectPlace", place: place("cookd") });
    expect(next).toEqual({ categoryId: null, placeId: "cookd" });
  });

  it("follows the selected place into its category while filtering", () => {
    const filtered = { categoryId: "experience" as const, placeId: null };
    const next = explorerReducer(filtered, { type: "selectPlace", place: place("cookd") });
    expect(next).toEqual({ categoryId: "projects", placeId: "cookd" });
  });

  it("clears the selected place when the category changes", () => {
    const next = explorerReducer(
      { categoryId: null, placeId: "shopify" },
      { type: "showCategory", categoryId: "education" },
    );
    expect(next).toEqual({ categoryId: "education", placeId: null });
  });
});

describe("URL state", () => {
  it("round-trips through the query string", () => {
    const state = { categoryId: "projects" as const, placeId: "cookd" };
    expect(parseExplorerState(serializeExplorerState(state))).toEqual(state);
  });

  it("drops unknown categories and places", () => {
    expect(parseExplorerState("?category=nope&place=missing")).toEqual(initialExplorerState);
  });

  it("serializes the empty state to an empty string", () => {
    expect(serializeExplorerState(initialExplorerState)).toBe("");
  });
});

describe("planCameraIntent", () => {
  it("frames the overview on first load", () => {
    expect(planCameraIntent(null, initialExplorerState)).toEqual({ kind: "overview", categoryId: null });
  });

  it("flies to a newly selected place", () => {
    expect(planCameraIntent(initialExplorerState, { categoryId: null, placeId: "shopify" })).toEqual({
      kind: "place",
      placeId: "shopify",
    });
  });

  it("stays put when a place is closed", () => {
    expect(planCameraIntent({ categoryId: null, placeId: "shopify" }, initialExplorerState)).toBeNull();
  });

  it("frames a category when it is chosen", () => {
    expect(planCameraIntent(initialExplorerState, { categoryId: "projects", placeId: null })).toEqual({
      kind: "overview",
      categoryId: "projects",
    });
  });
});
