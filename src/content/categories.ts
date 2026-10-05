import { BriefcaseBusiness, Code, GraduationCap, Plane, Trophy, type LucideIcon } from "lucide-react";
import type { CategoryId } from "./types";

export interface Category {
  readonly id: CategoryId;
  readonly label: string;
  readonly singular: string;
  readonly color: string;
  readonly icon: LucideIcon;
}

export const categories: readonly Category[] = [
  { id: "experience", label: "Experience", singular: "Experience", color: "#2563eb", icon: BriefcaseBusiness },
  { id: "projects", label: "Projects", singular: "Project", color: "#9333ea", icon: Code },
  { id: "education", label: "Education", singular: "Education", color: "#059669", icon: GraduationCap },
  { id: "other-work", label: "Other work", singular: "Other work", color: "#ea580c", icon: Trophy },
  { id: "travel", label: "Travel", singular: "Travel", color: "#0891b2", icon: Plane },
];

const categoriesById: ReadonlyMap<CategoryId, Category> = new Map(
  categories.map((category) => [category.id, category]),
);

export function getCategory(id: CategoryId): Category {
  const category = categoriesById.get(id);
  if (!category) {
    throw new Error(`Unknown category: ${id}`);
  }
  return category;
}

const categoryIds: ReadonlySet<string> = new Set(categories.map((category) => category.id));

export function isCategoryId(value: string): value is CategoryId {
  return categoryIds.has(value);
}
