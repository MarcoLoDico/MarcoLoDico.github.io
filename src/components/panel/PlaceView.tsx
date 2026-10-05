import { ArrowLeft, CalendarDays, ExternalLink, MapPin, Share2 } from "lucide-react";
import type { CSSProperties } from "react";
import { getCategory } from "../../content/categories";
import { places } from "../../content/places";
import type { Highlight, Place, PlaceSection } from "../../content/types";
import { CategoryBadge } from "../CategoryBadge";
import { IconButton } from "../IconButton";
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
  const neighbours = places.filter((other) => other.site.id === place.site.id && other.id !== place.id);

  return (
    <article className="panel-view place-view" style={style}>
      <div className="place-hero">
        <IconButton label={backLabel} onClick={onBack} className="place-hero__back icon-button--glass">
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

      {neighbours.length > 0 && (
        <section className="panel-section" aria-labelledby="nearby-heading">
          <h2 id="nearby-heading" className="panel-section__title">
            Also here
          </h2>
          <ul className="place-list">
            {neighbours.map((neighbour) => (
              <PlaceListItem
                key={neighbour.id}
                place={neighbour}
                highlighted={neighbour.id === hoveredPlaceId}
                onSelect={onSelectPlace}
                onHover={onHoverPlace}
              />
            ))}
          </ul>
        </section>
      )}
    </article>
  );
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
