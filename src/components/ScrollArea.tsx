import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { prefersReducedMotion } from "../lib/motion";
import { thumbGeometry } from "../lib/scrollThumb";
import "./ScrollArea.css";

/** Share of the visible height a click on the track pages by, leaving some context on screen. */
const TRACK_PAGE_FRACTION = 0.9;

interface ScrollAreaProps {
  readonly className: string;
  /** Freezes scrolling, e.g. while a sheet only shows its header. */
  readonly isLocked?: boolean;
  readonly inert?: boolean;
  readonly children: ReactNode;
}

interface ThumbDrag {
  readonly pointerId: number;
  readonly startY: number;
  readonly startScrollTop: number;
  readonly scrollPerThumbPixel: number;
}

/**
 * A vertical scroller with an overlay scrollbar. Native scrollbars reserve a
 * gutter, which stops full-bleed content short of the panel edge, and run
 * into rounded corners; this thumb takes no width and its track is inset.
 */
export function ScrollArea({ className, isLocked = false, inert = false, children }: ScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const drag = useRef<ThumbDrag | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!viewport || !content || !track || !thumb) {
      return;
    }

    const syncThumb = () => {
      const geometry = thumbGeometry(viewport, track.clientHeight);
      track.classList.toggle("scroll-area__track--idle", geometry === null);
      if (geometry) {
        thumb.style.height = `${geometry.size}px`;
        thumb.style.transform = `translateY(${geometry.offset}px)`;
      }
    };

    syncThumb();
    const observer = new ResizeObserver(syncThumb);
    observer.observe(viewport);
    observer.observe(content);
    viewport.addEventListener("scroll", syncThumb, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", syncThumb);
    };
  }, []);

  const handleTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const thumb = thumbRef.current;
    const track = trackRef.current;
    if (!viewport || !thumb || !track || event.button !== 0) {
      return;
    }
    event.preventDefault();

    if (event.target !== thumb) {
      const direction = event.clientY < thumb.getBoundingClientRect().top ? -1 : 1;
      viewport.scrollBy({
        top: direction * viewport.clientHeight * TRACK_PAGE_FRACTION,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      return;
    }

    const geometry = thumbGeometry(viewport, track.clientHeight);
    if (!geometry) {
      return;
    }
    thumb.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: viewport.scrollTop,
      scrollPerThumbPixel: geometry.scrollPerThumbPixel,
    };
  };

  const handleThumbPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const session = drag.current;
    const viewport = viewportRef.current;
    if (!session || !viewport || session.pointerId !== event.pointerId) {
      return;
    }
    viewport.scrollTop = session.startScrollTop + (event.clientY - session.startY) * session.scrollPerThumbPixel;
  };

  const endThumbDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null;
    }
  };

  return (
    <div className={`scroll-area ${className}`} inert={inert}>
      <div ref={viewportRef} className={isLocked ? "scroll-area__viewport scroll-area__viewport--locked" : "scroll-area__viewport"}>
        <div ref={contentRef} className="scroll-area__content">
          {children}
        </div>
      </div>
      <div ref={trackRef} className="scroll-area__track" aria-hidden="true" onPointerDown={handleTrackPointerDown}>
        <div
          ref={thumbRef}
          className="scroll-area__thumb"
          onPointerMove={handleThumbPointerMove}
          onPointerUp={endThumbDrag}
          onPointerCancel={endThumbDrag}
        />
      </div>
    </div>
  );
}
