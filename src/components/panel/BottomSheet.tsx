import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";

export type SheetSnap = "collapsed" | "peek" | "expanded";

export const SHEET_COLLAPSED_HEIGHT = 96;
export const SHEET_PEEK_HEIGHT = 340;

const SNAP_ORDER: readonly SheetSnap[] = ["collapsed", "peek", "expanded"];
const TAP_TOLERANCE_PIXELS = 6;
const FLICK_VELOCITY_PX_PER_MS = 0.45;

const SNAP_VISIBLE_HEIGHT: Record<SheetSnap, string> = {
  collapsed: `${SHEET_COLLAPSED_HEIGHT}px`,
  peek: `${SHEET_PEEK_HEIGHT}px`,
  expanded: "100%",
};

interface DragSession {
  readonly pointerId: number;
  readonly startY: number;
  lastY: number;
  lastTime: number;
  velocity: number;
}

interface BottomSheetProps {
  readonly snap: SheetSnap;
  readonly onSnapChange: (snap: SheetSnap) => void;
  readonly label: string;
  /** Changing the key remounts the scroll area so each view starts at the top. */
  readonly contentKey: string;
  readonly children: ReactNode;
}

function stepSnap(snap: SheetSnap, direction: 1 | -1): SheetSnap {
  const index = SNAP_ORDER.indexOf(snap) + direction;
  return SNAP_ORDER[Math.min(Math.max(index, 0), SNAP_ORDER.length - 1)] ?? snap;
}

function nearestSnap(visibleHeight: number, expandedHeight: number): SheetSnap {
  const candidates: readonly [SheetSnap, number][] = [
    ["collapsed", SHEET_COLLAPSED_HEIGHT],
    ["peek", SHEET_PEEK_HEIGHT],
    ["expanded", expandedHeight],
  ];
  let best: [SheetSnap, number] = ["peek", Number.POSITIVE_INFINITY];
  for (const [snap, height] of candidates) {
    const distance = Math.abs(visibleHeight - height);
    if (distance < best[1]) {
      best = [snap, distance];
    }
  }
  return best[0];
}

/**
 * A three-stop sheet like the one in mobile maps apps. Dragging writes the
 * offset straight to the element so the gesture never waits on React.
 */
export function BottomSheet({ snap, onSnapChange, label, contentKey, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useRef<DragSession | null>(null);
  const style: CSSProperties = { "--sheet-visible": SNAP_VISIBLE_HEIGHT[snap] };

  const setDragOffset = (offset: number) => {
    sheetRef.current?.style.setProperty("--sheet-drag", `${offset}px`);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
    };
    sheetRef.current?.classList.add("bottom-sheet--dragging");
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const session = drag.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }
    const elapsed = Math.max(event.timeStamp - session.lastTime, 1);
    session.velocity = (event.clientY - session.lastY) / elapsed;
    session.lastY = event.clientY;
    session.lastTime = event.timeStamp;
    setDragOffset(event.clientY - session.startY);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const session = drag.current;
    const sheet = sheetRef.current;
    if (!session || session.pointerId !== event.pointerId || !sheet) {
      return;
    }
    drag.current = null;
    sheet.classList.remove("bottom-sheet--dragging");

    const travel = event.clientY - session.startY;
    const visibleHeight = window.innerHeight - sheet.getBoundingClientRect().top;
    setDragOffset(0);

    if (Math.abs(travel) < TAP_TOLERANCE_PIXELS) {
      onSnapChange(snap === "expanded" ? "peek" : stepSnap(snap, 1));
    } else if (Math.abs(session.velocity) > FLICK_VELOCITY_PX_PER_MS) {
      onSnapChange(stepSnap(snap, session.velocity < 0 ? 1 : -1));
    } else {
      onSnapChange(nearestSnap(visibleHeight, sheet.offsetHeight));
    }
  };

  return (
    <section ref={sheetRef} className={`bottom-sheet bottom-sheet--${snap}`} style={style} aria-label={label}>
      <div
        className="bottom-sheet__handle"
        role="button"
        tabIndex={0}
        aria-label={snap === "expanded" ? "Collapse panel" : "Expand panel"}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSnapChange(snap === "expanded" ? "peek" : stepSnap(snap, 1));
          }
        }}
      >
        <span className="bottom-sheet__grip" />
      </div>
      <div key={contentKey} className="bottom-sheet__content">
        {children}
      </div>
    </section>
  );
}
