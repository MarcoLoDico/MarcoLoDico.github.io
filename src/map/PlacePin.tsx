import type { CSSProperties } from "react";
import { getCategory } from "../content/categories";
import type { Place } from "../content/types";
import { ResponsivePicture } from "../components/photos/ResponsivePicture";

interface PlacePinProps {
  readonly place: Place;
  readonly selected: boolean;
  readonly highlighted: boolean;
  readonly onSelect: (place: Place) => void;
  readonly onHover: (placeId: string | null) => void;
}

export function PlacePin({ place, selected, highlighted, onSelect, onHover }: PlacePinProps) {
  const category = getCategory(place.category);
  const Icon = category.icon;
  const cover = place.photos?.[0];
  const style: CSSProperties = { "--category-color": category.color };

  const className = [
    "place-pin",
    cover && "place-pin--photo",
    selected && "place-pin--selected",
    highlighted && "place-pin--highlighted",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={`${place.name}, ${category.singular}`}
      aria-pressed={selected}
      onClick={() => onSelect(place)}
      onPointerEnter={() => onHover(place.id)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(place.id)}
      onBlur={() => onHover(null)}
    >
      <span className="place-pin__label">{place.name}</span>
      <span className="place-pin__body">
        <span className="place-pin__head">
          {cover ? (
            <ResponsivePicture
              picture={cover.picture}
              alt=""
              sizes="48px"
              loading="eager"
              className="place-pin__photo"
            />
          ) : (
            <Icon aria-hidden="true" size={16} strokeWidth={2.25} />
          )}
        </span>
        <span className="place-pin__shadow" aria-hidden="true" />
      </span>
    </button>
  );
}
