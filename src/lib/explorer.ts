import { isCategoryId } from "../content/categories";
import { findPlace } from "../content/places";
import type { CategoryId, Place } from "../content/types";

export interface ExplorerState {
  readonly categoryId: CategoryId | null;
  readonly placeId: string | null;
}

export type ExplorerAction =
  | { readonly type: "selectPlace"; readonly place: Place }
  | { readonly type: "showCategory"; readonly categoryId: CategoryId | null }
  | { readonly type: "closePlace" }
  | { readonly type: "reset" }
  | { readonly type: "restore"; readonly state: ExplorerState };

export const initialExplorerState: ExplorerState = { categoryId: null, placeId: null };

export function explorerReducer(state: ExplorerState, action: ExplorerAction): ExplorerState {
  switch (action.type) {
    case "selectPlace":
      return {
        categoryId: state.categoryId === null ? null : action.place.category,
        placeId: action.place.id,
      };
    case "showCategory":
      return { categoryId: action.categoryId, placeId: null };
    case "closePlace":
      return { ...state, placeId: null };
    case "reset":
      return initialExplorerState;
    case "restore":
      return action.state;
  }
}

const CATEGORY_PARAM = "category";
const PLACE_PARAM = "place";

export function parseExplorerState(search: string): ExplorerState {
  const params = new URLSearchParams(search);
  const category = params.get(CATEGORY_PARAM);
  const placeId = params.get(PLACE_PARAM);

  return {
    categoryId: category !== null && isCategoryId(category) ? category : null,
    placeId: placeId !== null && findPlace(placeId) ? placeId : null,
  };
}

export function serializeExplorerState(state: ExplorerState): string {
  const params = new URLSearchParams();
  if (state.categoryId) {
    params.set(CATEGORY_PARAM, state.categoryId);
  }
  if (state.placeId) {
    params.set(PLACE_PARAM, state.placeId);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function isSameExplorerState(a: ExplorerState, b: ExplorerState): boolean {
  return a.categoryId === b.categoryId && a.placeId === b.placeId;
}
