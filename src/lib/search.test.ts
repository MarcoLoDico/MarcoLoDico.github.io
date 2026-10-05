import { describe, expect, it } from "vitest";
import { places } from "../content/places";
import { profile } from "../content/profile";
import { createSearchIndex, matchSkills, normalize } from "./search";

const search = createSearchIndex(places);

function resultIds(query: string): string[] {
  return search(query).map((result) => result.place.id);
}

describe("normalize", () => {
  it("lowercases, strips accents, and collapses whitespace", () => {
    expect(normalize("  Café   Résumé ")).toBe("cafe resume");
  });
});

describe("createSearchIndex", () => {
  it("returns nothing for a blank query", () => {
    expect(search("   ")).toEqual([]);
  });

  it("ranks a name match first", () => {
    expect(resultIds("shopify")[0]).toBe("shopify");
  });

  it("matches word prefixes while typing", () => {
    expect(resultIds("shop")[0]).toBe("shopify");
  });

  it("finds places by tag and reports the matched tag", () => {
    const [first] = search("supabase");
    expect(first?.place.id).toBe("cookd");
    expect(first?.matchedTag).toBe("Supabase");
  });

  it("requires every word of the query to match", () => {
    expect(resultIds("flutter waterloo")).toEqual(["blindseer"]);
    expect(resultIds("flutter shopify")).toEqual([]);
  });

  it("matches category labels", () => {
    const ids = resultIds("education");
    expect(ids).toContain("university-of-waterloo");
  });

  it("searches the body text of roles", () => {
    expect(resultIds("routing rules")).toEqual(["shopify"]);
  });
});

describe("matchSkills", () => {
  it("finds skills by word prefix", () => {
    expect(matchSkills(profile.skillGroups, "rus")).toEqual([{ skill: "Rust", group: "Languages" }]);
  });

  it("ignores empty queries", () => {
    expect(matchSkills(profile.skillGroups, "")).toEqual([]);
  });
});
