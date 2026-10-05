import { getCategory } from "../../content/categories";
import { findPlace } from "../../content/places";
import type { CategoryId, Place } from "../../content/types";
import type { ExplorerState } from "../../lib/explorer";
import { CategoryView } from "./CategoryView";
import { OverviewView } from "./OverviewView";
import { PlaceView } from "./PlaceView";
import "./panel.css";

interface PanelContentProps {
  readonly explorer: ExplorerState;
  readonly hoveredPlaceId: string | null;
  readonly onSelectPlace: (place: Place) => void;
  readonly onHoverPlace: (placeId: string | null) => void;
  readonly onShowCategory: (categoryId: CategoryId | null) => void;
  readonly onClosePlace: () => void;
  readonly onSharePlace: (place: Place) => void;
}

export function panelLabel(explorer: ExplorerState): string {
  const place = explorer.placeId ? findPlace(explorer.placeId) : undefined;
  if (place) {
    return place.name;
  }
  return explorer.categoryId ? getCategory(explorer.categoryId).label : "About Marco";
}

export function PanelContent({
  explorer,
  hoveredPlaceId,
  onSelectPlace,
  onHoverPlace,
  onShowCategory,
  onClosePlace,
  onSharePlace,
}: PanelContentProps) {
  const place = explorer.placeId ? findPlace(explorer.placeId) : undefined;

  if (place) {
    return (
      <PlaceView
        key={place.id}
        place={place}
        backLabel={explorer.categoryId ? `Back to ${getCategory(explorer.categoryId).label}` : "Back to overview"}
        hoveredPlaceId={hoveredPlaceId}
        onBack={onClosePlace}
        onShare={onSharePlace}
        onSelectPlace={onSelectPlace}
        onHoverPlace={onHoverPlace}
      />
    );
  }

  if (explorer.categoryId) {
    return (
      <CategoryView
        key={explorer.categoryId}
        categoryId={explorer.categoryId}
        hoveredPlaceId={hoveredPlaceId}
        onBack={() => onShowCategory(null)}
        onSelectPlace={onSelectPlace}
        onHoverPlace={onHoverPlace}
      />
    );
  }

  return (
    <OverviewView
      hoveredPlaceId={hoveredPlaceId}
      onSelectPlace={onSelectPlace}
      onHoverPlace={onHoverPlace}
      onShowCategory={onShowCategory}
    />
  );
}
