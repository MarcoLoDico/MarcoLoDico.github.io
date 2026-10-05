import type { CSSProperties } from "react";
import { categories } from "../../content/categories";
import { places } from "../../content/places";
import { profile } from "../../content/profile";
import type { CategoryId, Place } from "../../content/types";
import { SocialLinks } from "../SocialLinks";
import { PlaceListItem } from "./PlaceListItem";

interface OverviewViewProps {
  readonly hoveredPlaceId: string | null;
  readonly onSelectPlace: (place: Place) => void;
  readonly onHoverPlace: (placeId: string | null) => void;
  readonly onShowCategory: (categoryId: CategoryId) => void;
}

const featuredPlaces = places.filter((place) => place.featured);

function countPlaces(categoryId: CategoryId): number {
  return places.filter((place) => place.category === categoryId).length;
}

export function OverviewView({ hoveredPlaceId, onSelectPlace, onHoverPlace, onShowCategory }: OverviewViewProps) {
  return (
    <div className="panel-view">
      <header className="profile">
        <div className="profile__avatar" aria-hidden="true">
          {profile.initials}
        </div>
        <div>
          <h1 className="profile__name">{profile.name}</h1>
          <p className="profile__headline">{profile.headline}</p>
        </div>
      </header>
      <p className="profile__bio">{profile.bio}</p>
      <SocialLinks showLabels className="profile__socials" />

      <section className="panel-section" aria-labelledby="explore-heading">
        <h2 id="explore-heading" className="panel-section__title">
          Explore the map
        </h2>
        <div className="category-tiles">
          {categories.map((category) => {
            const Icon = category.icon;
            const style: CSSProperties = { "--category-color": category.color };
            return (
              <button
                key={category.id}
                type="button"
                className="category-tile"
                style={style}
                onClick={() => onShowCategory(category.id)}
              >
                <span className="category-tile__icon" aria-hidden="true">
                  <Icon size={18} strokeWidth={2.25} />
                </span>
                <span className="category-tile__label">{category.label}</span>
                <span className="category-tile__count">{countPlaces(category.id)} on the map</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel-section" aria-labelledby="featured-heading">
        <h2 id="featured-heading" className="panel-section__title">
          Start here
        </h2>
        <ul className="place-list">
          {featuredPlaces.map((place) => (
            <PlaceListItem
              key={place.id}
              place={place}
              highlighted={place.id === hoveredPlaceId}
              onSelect={onSelectPlace}
              onHover={onHoverPlace}
            />
          ))}
        </ul>
      </section>

      <section className="panel-section" id="skills" aria-labelledby="skills-heading">
        <h2 id="skills-heading" className="panel-section__title">
          Skills
        </h2>
        {profile.skillGroups.map((group) => (
          <div key={group.label} className="skill-group">
            <h3 className="skill-group__label">{group.label}</h3>
            <ul className="chip-list">
              {group.skills.map((skill) => (
                <li key={skill} className="chip chip--static">
                  {skill}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <p className="panel-hint">
        Press <kbd>/</kbd> to search. Right-drag or two-finger drag to tilt the globe.
      </p>
    </div>
  );
}
