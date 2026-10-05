import type { CSSProperties } from "react";
import { getCategory } from "../content/categories";
import type { CategoryId } from "../content/types";

interface CategoryBadgeProps {
  readonly categoryId: CategoryId;
  readonly size?: "small" | "large";
}

const ICON_SIZES = { small: 16, large: 22 } as const;

export function CategoryBadge({ categoryId, size = "small" }: CategoryBadgeProps) {
  const category = getCategory(categoryId);
  const Icon = category.icon;
  const style: CSSProperties = { "--category-color": category.color };

  return (
    <span className={`category-badge category-badge--${size}`} style={style} aria-hidden="true">
      <Icon size={ICON_SIZES[size]} strokeWidth={2.25} />
    </span>
  );
}
