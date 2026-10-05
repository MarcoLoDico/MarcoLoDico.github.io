import type { CSSProperties } from "react";
import { categories } from "../content/categories";
import { places } from "../content/places";
import type { CategoryId } from "../content/types";
import "./CategoryChips.css";

interface CategoryChipsProps {
  readonly activeCategoryId: CategoryId | null;
  readonly onShowCategory: (categoryId: CategoryId | null) => void;
}

const placeCounts: ReadonlyMap<CategoryId, number> = new Map(
  categories.map((category) => [category.id, places.filter((place) => place.category === category.id).length]),
);

export function CategoryChips({ activeCategoryId, onShowCategory }: CategoryChipsProps) {
  return (
    <nav className="category-chips" aria-label="Filter the map by category">
      {categories.map((category) => {
        const Icon = category.icon;
        const isActive = category.id === activeCategoryId;
        const style: CSSProperties = { "--category-color": category.color };

        return (
          <button
            key={category.id}
            type="button"
            className={isActive ? "category-chip category-chip--active" : "category-chip"}
            style={style}
            aria-pressed={isActive}
            onClick={() => onShowCategory(isActive ? null : category.id)}
          >
            <Icon size={16} strokeWidth={2.25} aria-hidden="true" />
            <span>{category.label}</span>
            <span className="category-chip__count">{placeCounts.get(category.id)}</span>
          </button>
        );
      })}
    </nav>
  );
}
