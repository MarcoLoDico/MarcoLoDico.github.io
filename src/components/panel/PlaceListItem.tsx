import { ChevronRight } from "lucide-react";
import type { Place } from "../../content/types";
import { CategoryBadge } from "../CategoryBadge";
import { ResponsivePicture } from "../photos/ResponsivePicture";

interface PlaceListItemProps {
  readonly place: Place;
  readonly highlighted: boolean;
  readonly onSelect: (place: Place) => void;
  readonly onHover: (placeId: string | null) => void;
}

export function PlaceListItem({ place, highlighted, onSelect, onHover }: PlaceListItemProps) {
  const cover = place.photos?.[0];
  return (
    <li>
      <button
        type="button"
        className={highlighted ? "place-item place-item--highlighted" : "place-item"}
        onClick={() => onSelect(place)}
        onPointerEnter={() => onHover(place.id)}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onHover(place.id)}
        onBlur={() => onHover(null)}
      >
        {cover ? (
          <ResponsivePicture picture={cover.picture} alt="" sizes="44px" className="place-item__thumb" />
        ) : (
          <CategoryBadge categoryId={place.category} size="large" />
        )}
        <span className="place-item__text">
          <span className="place-item__name">{place.name}</span>
          <span className="place-item__subtitle">{place.subtitle}</span>
          <span className="place-item__meta">
            {place.site.label} · {place.period}
          </span>
        </span>
        <ChevronRight className="place-item__chevron" size={18} aria-hidden="true" />
      </button>
    </li>
  );
}
