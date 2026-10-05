import type { Picture } from "vite-imagetools";

const MIME_TYPES: Readonly<Record<string, string>> = {
  avif: "image/avif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

interface ResponsivePictureProps {
  readonly picture: Picture;
  readonly alt: string;
  /** How wide the image renders, so the browser can pick the smallest file that stays sharp. */
  readonly sizes: string;
  readonly className?: string;
  readonly loading?: "lazy" | "eager";
}

export function ResponsivePicture({ picture, alt, sizes, className, loading = "lazy" }: ResponsivePictureProps) {
  return (
    <picture className={className}>
      {Object.entries(picture.sources).map(([format, srcSet]) => (
        <source key={format} type={MIME_TYPES[format]} srcSet={srcSet} sizes={sizes} />
      ))}
      <img
        src={picture.img.src}
        width={picture.img.w}
        height={picture.img.h}
        alt={alt}
        loading={loading}
        decoding="async"
      />
    </picture>
  );
}
