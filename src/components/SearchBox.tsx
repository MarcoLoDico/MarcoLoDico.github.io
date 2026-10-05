import { Search, Sparkles, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { categories, getCategory, type Category } from "../content/categories";
import { places } from "../content/places";
import { profile } from "../content/profile";
import type { CategoryId, Place } from "../content/types";
import { isTypingTarget } from "../lib/dom";
import { createSearchIndex, matchSkills, normalize, type SearchResult, type SkillMatch } from "../lib/search";
import { CategoryBadge } from "./CategoryBadge";
import "./SearchBox.css";

type SearchOption =
  | { readonly kind: "category"; readonly key: string; readonly category: Category }
  | { readonly kind: "place"; readonly key: string; readonly result: SearchResult }
  | { readonly kind: "skill"; readonly key: string; readonly match: SkillMatch };

interface SearchBoxProps {
  readonly onSelectPlace: (place: Place) => void;
  readonly onShowCategory: (categoryId: CategoryId) => void;
  readonly onShowSkills: () => void;
}

const searchPlaces = createSearchIndex(places);
const MAX_SKILL_OPTIONS = 3;
const SUGGESTED_QUERIES = ["Shopify", "TypeScript", "Infrastructure", "Waterloo"] as const;

function buildOptions(query: string): SearchOption[] {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length === 0) {
    return [];
  }

  const categoryOptions = categories
    .filter((category) => normalize(category.label).startsWith(normalizedQuery))
    .map((category): SearchOption => ({ kind: "category", key: `category-${category.id}`, category }));

  const placeOptions = searchPlaces(query).map(
    (result): SearchOption => ({ kind: "place", key: `place-${result.place.id}`, result }),
  );

  const skillOptions = matchSkills(profile.skillGroups, query)
    .slice(0, MAX_SKILL_OPTIONS)
    .map((match): SearchOption => ({ kind: "skill", key: `skill-${match.skill}`, match }));

  return [...categoryOptions, ...placeOptions, ...skillOptions];
}

export function SearchBox({ onSelectPlace, onShowCategory, onShowSkills }: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const options = useMemo(() => buildOptions(query), [query]);
  const hasQuery = query.trim().length > 0;
  const showDropdown = isOpen && hasQuery;
  const activeOption = options[activeIndex];

  useEffect(() => {
    const focusOnSlash = (event: globalThis.KeyboardEvent) => {
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", focusOnSlash);
    return () => document.removeEventListener("keydown", focusOnSlash);
  }, []);

  const updateQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setActiveIndex(0);
    setIsOpen(true);
  };

  const finish = () => {
    setQuery("");
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const choose = (option: SearchOption) => {
    switch (option.kind) {
      case "category":
        onShowCategory(option.category.id);
        break;
      case "place":
        onSelectPlace(option.result.place);
        break;
      case "skill":
        onShowSkills();
        break;
    }
    finish();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setIsOpen(true);
        setActiveIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Enter":
        if (activeOption) {
          event.preventDefault();
          choose(activeOption);
        }
        break;
      case "Escape":
        if (hasQuery) {
          setQuery("");
        } else {
          inputRef.current?.blur();
        }
        break;
    }
  };

  return (
    <div className={showDropdown ? "search search--open" : "search"}>
      <div className="search__field">
        <Search className="search__icon" size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          className="search__input"
          type="text"
          role="combobox"
          aria-label="Search Marco's map"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={showDropdown && activeOption ? `${listboxId}-${activeOption.key}` : undefined}
          placeholder="Search experience, projects, skills…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          onKeyDown={handleKeyDown}
        />
        {hasQuery ? (
          <button type="button" className="search__clear" aria-label="Clear search" onClick={() => updateQuery("")}>
            <X size={16} />
          </button>
        ) : (
          <kbd className="search__shortcut" aria-hidden="true">
            /
          </kbd>
        )}
      </div>

      {showDropdown && (
        <div className="search__dropdown">
          {options.length > 0 ? (
            <ul id={listboxId} role="listbox" className="search__results" aria-label="Search results">
              {options.map((option, index) => (
                <li
                  key={option.key}
                  id={`${listboxId}-${option.key}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className="search__option"
                  onPointerDown={(event) => event.preventDefault()}
                  onPointerMove={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                >
                  <SearchOptionContent option={option} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="search__empty">
              <p>
                Nothing on the map matches <strong>“{query.trim()}”</strong>.
              </p>
              <div className="search__suggestions">
                {SUGGESTED_QUERIES.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="chip"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => updateQuery(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchOptionContent({ option }: { readonly option: SearchOption }) {
  switch (option.kind) {
    case "category":
      return (
        <>
          <CategoryBadge categoryId={option.category.id} />
          <span className="search__option-text">
            <span className="search__option-title">Show all {option.category.label.toLowerCase()}</span>
            <span className="search__option-meta">Category</span>
          </span>
        </>
      );
    case "place": {
      const { place, matchedTag } = option.result;
      return (
        <>
          <CategoryBadge categoryId={place.category} />
          <span className="search__option-text">
            <span className="search__option-title">{place.name}</span>
            <span className="search__option-meta">
              {place.subtitle} · {place.site.label}
            </span>
          </span>
          {matchedTag && <span className="search__option-tag">{matchedTag}</span>}
          <span className="visually-hidden">{getCategory(place.category).singular}</span>
        </>
      );
    }
    case "skill":
      return (
        <>
          <span className="search__skill-icon" aria-hidden="true">
            <Sparkles size={16} />
          </span>
          <span className="search__option-text">
            <span className="search__option-title">{option.match.skill}</span>
            <span className="search__option-meta">Skill · {option.match.group}</span>
          </span>
        </>
      );
  }
}
