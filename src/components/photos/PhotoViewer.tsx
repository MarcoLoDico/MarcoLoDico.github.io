import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import type { Photo } from "../../content/types";
import { IconButton } from "../IconButton";
import { ResponsivePicture } from "./ResponsivePicture";
import "./photos.css";

interface PhotoViewerProps {
  readonly photos: readonly Photo[];
  /** The photo on screen; `null` keeps the viewer closed. */
  readonly index: number | null;
  readonly onIndexChange: (index: number | null) => void;
}

export function PhotoViewer({ photos, index, onIndexChange }: PhotoViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const photo = index === null ? undefined : photos[index];
  const isOpen = photo !== undefined;
  const canStep = photos.length > 1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog?.open) {
      dialog.close();
    }
  }, [isOpen]);

  const close = () => dialogRef.current?.close();

  const step = (delta: number) => {
    if (index !== null) {
      onIndexChange((index + delta + photos.length) % photos.length);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "ArrowLeft") {
      step(-1);
    } else if (event.key === "ArrowRight") {
      step(1);
    }
  };

  const closeOnBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      close();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="photo-viewer"
      aria-label="Photo viewer"
      onClose={() => onIndexChange(null)}
      onKeyDown={handleKeyDown}
      onClick={closeOnBackdropClick}
    >
      {photo && index !== null && (
        <>
          <figure className="photo-viewer__figure">
            <ResponsivePicture
              picture={photo.picture}
              alt={photo.alt}
              sizes="100vw"
              loading="eager"
              className="photo-viewer__picture"
            />
            <figcaption className="photo-viewer__caption">
              {photo.caption && <span>{photo.caption}</span>}
              {canStep && (
                <span className="photo-viewer__count">
                  {index + 1} / {photos.length}
                </span>
              )}
            </figcaption>
          </figure>
          <IconButton label="Close photo" onClick={close} className="photo-viewer__close icon-button--scrim">
            <X size={20} />
          </IconButton>
          {canStep && (
            <>
              <IconButton
                label="Previous photo"
                onClick={() => step(-1)}
                className="photo-viewer__step photo-viewer__step--previous icon-button--scrim"
              >
                <ChevronLeft size={22} />
              </IconButton>
              <IconButton
                label="Next photo"
                onClick={() => step(1)}
                className="photo-viewer__step photo-viewer__step--next icon-button--scrim"
              >
                <ChevronRight size={22} />
              </IconButton>
            </>
          )}
        </>
      )}
    </dialog>
  );
}
