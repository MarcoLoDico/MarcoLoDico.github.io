export const MIN_THUMB_PIXELS = 32;

export interface ScrollMetrics {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

export interface ThumbGeometry {
  readonly size: number;
  readonly offset: number;
  /** Content pixels scrolled per pixel the thumb is dragged. */
  readonly scrollPerThumbPixel: number;
}

/** Sizes and places a scrollbar thumb on a track, or returns null when nothing overflows. */
export function thumbGeometry(metrics: ScrollMetrics, trackLength: number): ThumbGeometry | null {
  const scrollRange = metrics.scrollHeight - metrics.clientHeight;
  if (scrollRange <= 0 || trackLength <= 0) {
    return null;
  }
  const size = Math.min(trackLength, Math.max(MIN_THUMB_PIXELS, (trackLength * metrics.clientHeight) / metrics.scrollHeight));
  const thumbTravel = trackLength - size;
  const progress = Math.min(Math.max(metrics.scrollTop / scrollRange, 0), 1);
  return {
    size,
    offset: thumbTravel * progress,
    scrollPerThumbPixel: thumbTravel > 0 ? scrollRange / thumbTravel : 0,
  };
}
