import type { Picture } from "vite-imagetools";

const PHOTO_DIRECTORY = "./photos/";

/**
 * Every file in `./photos` is resized and re-encoded at build time, so
 * originals can be added at full resolution. Widths cover map pins, list
 * thumbnails, the panel cover, and the full-screen viewer.
 */
const pictures = import.meta.glob<Picture>("./photos/*.{jpg,jpeg,png,webp}", {
  eager: true,
  import: "default",
  query: "?w=160;480;960;1600&format=webp;jpg&as=picture",
});

/** Looks up a photo by file name; a missing file fails the build instead of rendering a broken image. */
export function photo(fileName: string): Picture {
  const picture = pictures[`${PHOTO_DIRECTORY}${fileName}`];
  if (!picture) {
    throw new Error(`No photo named "${fileName}" in src/content/photos`);
  }
  return picture;
}
