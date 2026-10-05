import { getCategory } from "../content/categories";
import type { SkillGroup } from "../content/profile";
import type { Place, PlaceSection } from "../content/types";

export interface SearchResult {
  readonly place: Place;
  readonly score: number;
  readonly matchedTag: string | undefined;
}

interface WeightedField {
  readonly text: string;
  readonly weight: number;
}

interface IndexedPlace {
  readonly place: Place;
  readonly fields: readonly WeightedField[];
  readonly normalizedTags: readonly string[];
}

const FIELD_WEIGHTS = {
  name: 10,
  subtitle: 4,
  category: 4,
  tag: 3,
  location: 2,
  body: 1,
} as const;

const SUBSTRING_MATCH_FACTOR = 0.5;
const DEFAULT_RESULT_LIMIT = 8;

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(query: string): string[] {
  return normalize(query).split(" ").filter((token) => token.length > 0);
}

function sectionText(section: PlaceSection): string[] {
  switch (section.kind) {
    case "roles":
      return section.roles.flatMap((role) => [role.title, ...role.highlights.map((highlight) => highlight.text)]);
    case "highlights":
      return section.highlights.map((highlight) => highlight.text);
    case "facts":
      return section.facts.flatMap((fact) => [fact.label, fact.value]);
  }
}

function indexPlace(place: Place): IndexedPlace {
  const body = [place.summary, ...place.sections.flatMap(sectionText)].join(" ");
  const normalizedTags = place.tags.map(normalize);

  return {
    place,
    normalizedTags,
    fields: [
      { text: normalize(place.name), weight: FIELD_WEIGHTS.name },
      { text: normalize(place.subtitle), weight: FIELD_WEIGHTS.subtitle },
      { text: normalize(getCategory(place.category).label), weight: FIELD_WEIGHTS.category },
      ...normalizedTags.map((tag) => ({ text: tag, weight: FIELD_WEIGHTS.tag })),
      { text: normalize(place.site.label), weight: FIELD_WEIGHTS.location },
      { text: normalize(body), weight: FIELD_WEIGHTS.body },
    ],
  };
}

function startsAnyWord(text: string, token: string): boolean {
  return text.startsWith(token) || text.includes(` ${token}`);
}

function scoreToken(fields: readonly WeightedField[], token: string): number {
  let best = 0;
  for (const field of fields) {
    if (startsAnyWord(field.text, token)) {
      best = Math.max(best, field.weight);
    } else if (field.text.includes(token)) {
      best = Math.max(best, field.weight * SUBSTRING_MATCH_FACTOR);
    }
  }
  return best;
}

function scorePlace(indexed: IndexedPlace, tokens: readonly string[]): number {
  let total = 0;
  for (const token of tokens) {
    const tokenScore = scoreToken(indexed.fields, token);
    if (tokenScore === 0) {
      return 0;
    }
    total += tokenScore;
  }
  return total;
}

function findMatchedTag(indexed: IndexedPlace, tokens: readonly string[]): string | undefined {
  const tagIndex = indexed.normalizedTags.findIndex((tag) => tokens.some((token) => tag.includes(token)));
  return tagIndex === -1 ? undefined : indexed.place.tags[tagIndex];
}

export interface SkillMatch {
  readonly skill: string;
  readonly group: string;
}

export function matchSkills(groups: readonly SkillGroup[], query: string): SkillMatch[] {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length === 0) {
    return [];
  }
  return groups.flatMap((group) =>
    group.skills
      .filter((skill) => startsAnyWord(normalize(skill), normalizedQuery))
      .map((skill) => ({ skill, group: group.label })),
  );
}

export type SearchFunction = (query: string, limit?: number) => SearchResult[];

export function createSearchIndex(places: readonly Place[]): SearchFunction {
  const index = places.map(indexPlace);

  return (query, limit = DEFAULT_RESULT_LIMIT) => {
    const tokens = tokenize(query);
    if (tokens.length === 0) {
      return [];
    }

    return index
      .map((indexed) => ({
        place: indexed.place,
        score: scorePlace(indexed, tokens),
        matchedTag: findMatchedTag(indexed, tokens),
      }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name))
      .slice(0, limit);
  };
}
