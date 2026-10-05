import type { CategoryId } from "../content/types";
import type { ExplorerState } from "../lib/explorer";

export type CameraIntent =
  | { readonly kind: "place"; readonly placeId: string }
  | { readonly kind: "overview"; readonly categoryId: CategoryId | null };

/**
 * Decides whether a change in what the visitor is exploring should move the
 * camera. Closing a place deliberately leaves the camera alone, the way a
 * maps app keeps you where you were when you dismiss a listing.
 */
export function planCameraIntent(previous: ExplorerState | null, next: ExplorerState): CameraIntent | null {
  if (next.placeId !== null && next.placeId !== previous?.placeId) {
    return { kind: "place", placeId: next.placeId };
  }
  if (next.placeId === null && (previous === null || next.categoryId !== previous.categoryId)) {
    return { kind: "overview", categoryId: next.categoryId };
  }
  return null;
}
