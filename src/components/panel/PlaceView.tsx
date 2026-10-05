import { ArrowLeft, CalendarDays, ExternalLink, MapPin, Route, Share2 } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { getCategory } from "../../content/categories";
import { places } from "../../content/places";
import type { Highlight, Place, PlaceSection } from "../../content/types";
import { placesOnSameTrip } from "../../lib/trips";
import { CategoryBadge } from "../CategoryBadge";
import { IconButton } from "../IconButton";
import { PhotoViewer } from "../photos/PhotoViewer";
import { ResponsivePicture } from "../photos/ResponsivePicture";
import { PlaceListItem } from "./PlaceListItem";

interface PlaceViewProps {
  readonly place: Place;
  readonly backLabel: string;
  readonly hoveredPlaceId: string | null;
  readonly onBack: () => void;
  readonly onShare: (place: Place) => void;
  readonly onSelectPlace: (place: Place) => void;
  readonly onHoverPlace: (placeId: string | null) => void;
}

export function PlaceView({
  place,
  backLabel,
  hoveredPlaceId,
  onBack,
  onShare,
  onSelectPlace,
  onHoverPlace,
}: PlaceViewProps) {
  const category = getCategory(place.category);
  const style: CSSProperties = { "--category-color": category.color };
  const photos = place.photos ?? [];
  const cover = photos[0];
  const [viewedPhotoIndex, setViewedPhotoIndex] = useState<number | null>(null);
  const related = relatedPlaces(place);

  return (
    <article className="panel-view place-view" style={style}>
      <div className={cover ? "place-hero place-hero--photo" : "place-hero"}>
        {cover && (
          <button
            type="button"
            className="place-hero__cover"
            aria-label={`View photos of ${place.name}`}
            onClick={() => setViewedPhotoIndex(0)}
          >
            <ResponsivePicture picture={cover.picture} alt={cover.alt} sizes="400px" loading="eager" />
          </button>
        )}
        <IconButton
          label={backLabel}
          onClick={onBack}
          className={`place-hero__back ${cover ? "icon-button--scrim" : "icon-button--glass"}`}
        >
          <ArrowLeft size={18} />
        </IconButton>
        <CategoryBadge categoryId={place.category} size="large" />
      </div>

      <header className="place-view__header">
        <p className="place-view__category">{category.singular}</p>
        <h1 className="place-view__name">{place.name}</h1>
        <p className="place-view__subtitle">{place.subtitle}</p>
        <ul className="place-view__meta">
          <li>
            <MapPin size={14} aria-hidden="true" />
            {place.site.label}
          </li>
          <li>
            <CalendarDays size={14} aria-hidden="true" />
            {place.period}
          </li>
          {place.trip && (
            <li>
              <Route size={14} aria-hidden="true" />
              {place.trip.name} trip
            </li>
          )}
        </ul>
      </header>

      <div className="place-actions">
        {place.links.map((link, index) => (
          <a
            key={link.href}
            className={index === 0 ? "action-button action-button--primary" : "action-button"}
            href={link.href}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} aria-hidden="true" />
            {link.label}
          </a>
        ))}
        <button type="button" className="action-button" onClick={() => onShare(place)}>
          <Share2 size={16} aria-hidden="true" />
          Share
        </button>
      </div>

      <p className="place-view__summary">{place.summary}</p>

      {photos.length > 1 && (
        <section className="panel-section" aria-labelledby="photos-heading">
          <h2 id="photos-heading" className="panel-section__title">
            Photos
          </h2>
          <ul className="photo-grid">
            {photos.map((photo, index) => (
              <li key={photo.picture.img.src}>
                <button
                  type="button"
                  className="photo-grid__item"
                  aria-label={`View photo: ${photo.caption ?? photo.alt}`}
                  onClick={() => setViewedPhotoIndex(index)}
                >
                  <ResponsivePicture picture={photo.picture} alt="" sizes="130px" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {place.sections.map((section, index) => (
        <PlaceSectionView key={`${section.kind}-${index}`} section={section} />
      ))}

      {place.tags.length > 0 && (
        <section className="panel-section" aria-label="Tags">
          <ul className="chip-list">
            {place.tags.map((tag) => (
              <li key={tag} className="chip chip--static">
                {tag}
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.places.length > 0 && (
        <section className="panel-section" aria-labelledby="related-heading">
          <h2 id="related-heading" className="panel-section__title">
            {related.title}
          </h2>
          <ul className="place-list">
            {related.places.map((relatedPlace) => (
              <PlaceListItem
                key={relatedPlace.id}
                place={relatedPlace}
                highlighted={relatedPlace.id === hoveredPlaceId}
                onSelect={onSelectPlace}
                onHover={onHoverPlace}
              />
            ))}
          </ul>
        </section>
      )}

      <PhotoViewer photos={photos} index={viewedPhotoIndex} onIndexChange={setViewedPhotoIndex} />
    </article>
  );
}

/** Stops on the same trip for travel, otherwise whatever else shares the place's site. */
function relatedPlaces(place: Place): { readonly title: string; readonly places: readonly Place[] } {
  if (place.trip) {
    return { title: `More from ${place.trip.name}`, places: placesOnSameTrip(place, places) };
  }
  return { title: "Also here", places: places.filter((other) => other.site.id === place.site.id && other.id !== place.id) };
}

function PlaceSectionView({ section }: { readonly section: PlaceSection }) {
  switch (section.kind) {
    case "roles":
      return (
        <section className="panel-section" aria-label="Roles">
          <ol className="timeline">
            {section.roles.map((role) => (
              <li key={`${role.title}-${role.period}`} className="timeline__item">
                <p className="timeline__period">{role.period}</p>
                <h2 className="timeline__title">{role.title}</h2>
                <HighlightList highlights={role.highlights} />
              </li>
            ))}
          </ol>
        </section>
      );
    case "highlights":
      return (
        <section className="panel-section">
          <h2 className="panel-section__title">{section.title}</h2>
          <HighlightList highlights={section.highlights} />
        </section>
      );
    case "facts":
      return (
        <section className="panel-section" aria-label="Key facts">
          <dl className="facts">
            {section.facts.map((fact) => (
              <div key={fact.label} className="facts__item">
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      );
  }
}

function HighlightList({ highlights }: { readonly highlights: readonly Highlight[] }) {
  return (
    <ul className="highlights">
      {highlights.map((highlight) => (
        <li key={highlight.text}>
          {highlight.text}
          {highlight.link && (
            <>
              {" "}
              <a className="inline-link" href={highlight.link.href} target="_blank" rel="noreferrer">
                {highlight.link.label}
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
