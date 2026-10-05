import { ArrowLeft } from "lucide-react";
import { getCategory } from "../../content/categories";
import { places } from "../../content/places";
import type { CategoryId, Place } from "../../content/types";
import { CategoryBadge } from "../CategoryBadge";
import { IconButton } from "../IconButton";
import { PlaceListItem } from "./PlaceListItem";

interface CategoryViewProps {
  readonly categoryId: CategoryId;
  readonly hoveredPlaceId: string | null;
  readonly onBack: () => void;
  readonly onSelectPlace: (place: Place) => void;
  readonly onHoverPlace: (placeId: string | null) => void;
}

export function CategoryView({ categoryId, hoveredPlaceId, onBack, onSelectPlace, onHoverPlace }: CategoryViewProps) {
  const category = getCategory(categoryId);
  const categoryPlaces = places.filter((place) => place.category === categoryId);

  return (
    <div className="panel-view">
      <header className="panel-header">
        <IconButton label="Back to overview" onClick={onBack}>
          <ArrowLeft size={18} />
        </IconButton>
        <CategoryBadge categoryId={categoryId} size="large" />
        <div>
          <h1 className="panel-header__title">{category.label}</h1>
          <p className="panel-header__meta">
            {categoryPlaces.length} {categoryPlaces.length === 1 ? "place" : "places"} on the map
          </p>
        </div>
      </header>
      <ul className="place-list">
        {categoryPlaces.map((place) => (
          <PlaceListItem
            key={place.id}
            place={place}
            highlighted={place.id === hoveredPlaceId}
            onSelect={onSelectPlace}
            onHover={onHoverPlace}
          />
        ))}
      </ul>
    </div>
  );
}
