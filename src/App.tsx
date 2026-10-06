import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CategoryChips } from "./components/CategoryChips";
import {
  BottomSheet,
  SHEET_COLLAPSED_HEIGHT,
  SHEET_PEEK_HEIGHT,
  type SheetSnap,
} from "./components/panel/BottomSheet";
import { PanelContent, panelLabel } from "./components/panel/PanelContent";
import { Sidebar, SIDEBAR_FOOTPRINT } from "./components/panel/Sidebar";
import { SearchBox } from "./components/SearchBox";
import { SocialLinks } from "./components/SocialLinks";
import { ThemeToggle } from "./components/ThemeToggle";
import { Toast, useToast } from "./components/Toast";
import { getCategory } from "./content/categories";
import { findPlace } from "./content/places";
import { profile } from "./content/profile";
import type { CategoryId, Place } from "./content/types";
import { useElementBottom } from "./hooks/useElementBottom";
import { useExplorer } from "./hooks/useExplorer";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useTheme } from "./hooks/useTheme";
import { isTypingTarget } from "./lib/dom";
import { serializeExplorerState, type ExplorerState } from "./lib/explorer";
import type { MapPadding } from "./map/padding";
import { placesInCategory } from "./map/placePositions";
import "./App.css";

/** MapLibre is most of the bundle, so the panel and search render before it arrives. */
const MapView = lazy(() => import("./map/MapView").then((module) => ({ default: module.MapView })));

const COMPACT_LAYOUT_QUERY = "(max-width: 760px)";
const BELOW_TOPBAR_GAP = 8;
const CONTROLS_INSET = 64;
const EDGE_INSET = 16;

function mapPaddingFor(
  isCompact: boolean,
  isSidebarOpen: boolean,
  sheetSnap: SheetSnap,
  topbarBottom: number,
): MapPadding {
  const top = topbarBottom + BELOW_TOPBAR_GAP;
  if (isCompact) {
    return {
      top,
      right: CONTROLS_INSET,
      bottom: sheetSnap === "collapsed" ? SHEET_COLLAPSED_HEIGHT : SHEET_PEEK_HEIGHT,
      left: EDGE_INSET,
    };
  }
  return {
    top,
    right: CONTROLS_INSET,
    bottom: EDGE_INSET,
    left: isSidebarOpen ? SIDEBAR_FOOTPRINT : EDGE_INSET,
  };
}

function documentTitleFor(explorer: ExplorerState): string {
  const place = explorer.placeId ? findPlace(explorer.placeId) : undefined;
  const section = place?.name ?? (explorer.categoryId ? getCategory(explorer.categoryId).label : undefined);
  return section ? `${section} · ${profile.name}` : `${profile.name} — Software Engineer`;
}

function shareUrlFor(place: Place): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${serializeExplorerState({ categoryId: null, placeId: place.id })}`;
}

export function App() {
  const [explorer, dispatch] = useExplorer();
  const { theme, toggleTheme } = useTheme();
  const { message: toastMessage, showToast } = useToast();
  const isCompact = useMediaQuery(COMPACT_LAYOUT_QUERY);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("peek");
  const topbarRef = useRef<HTMLElement>(null);
  const topbarBottom = useElementBottom(topbarRef);

  const visiblePlaces = useMemo(() => placesInCategory(explorer.categoryId), [explorer.categoryId]);
  const padding = useMemo(
    () => mapPaddingFor(isCompact, isSidebarOpen, sheetSnap, topbarBottom),
    [isCompact, isSidebarOpen, sheetSnap, topbarBottom],
  );
  const layoutStyle: CSSProperties = { "--topbar-bottom": `${topbarBottom}px` };

  const revealPanel = useCallback(() => {
    setIsSidebarOpen(true);
    setSheetSnap((snap) => (snap === "collapsed" ? "peek" : snap));
  }, []);

  const selectPlace = useCallback(
    (place: Place) => {
      dispatch({ type: "selectPlace", place });
      revealPanel();
    },
    [dispatch, revealPanel],
  );

  const showCategory = useCallback(
    (categoryId: CategoryId | null) => {
      dispatch({ type: "showCategory", categoryId });
      revealPanel();
    },
    [dispatch, revealPanel],
  );

  const closePlace = useCallback(() => dispatch({ type: "closePlace" }), [dispatch]);

  const showSkills = useCallback(() => {
    dispatch({ type: "reset" });
    revealPanel();
    requestAnimationFrame(() => document.getElementById("skills")?.scrollIntoView({ behavior: "smooth" }));
  }, [dispatch, revealPanel]);

  const sharePlace = useCallback(
    (place: Place) => {
      const url = shareUrlFor(place);
      if (isCompact && typeof navigator.share === "function") {
        navigator.share({ title: `${place.name} · ${profile.name}`, url }).catch(() => undefined);
        return;
      }
      navigator.clipboard
        .writeText(url)
        .then(() => showToast("Link copied to clipboard"))
        .catch(() => showToast("Couldn’t copy the link"));
    },
    [isCompact, showToast],
  );

  useEffect(() => {
    document.title = documentTitleFor(explorer);
  }, [explorer]);

  useEffect(() => {
    const stepBackOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isTypingTarget(event.target)) {
        return;
      }
      if (explorer.placeId) {
        dispatch({ type: "closePlace" });
      } else if (explorer.categoryId) {
        dispatch({ type: "showCategory", categoryId: null });
      }
    };
    document.addEventListener("keydown", stepBackOnEscape);
    return () => document.removeEventListener("keydown", stepBackOnEscape);
  }, [explorer, dispatch]);

  const contentKey = `${explorer.categoryId ?? "all"}/${explorer.placeId ?? "none"}`;
  const panelContent = (
    <PanelContent
      explorer={explorer}
      hoveredPlaceId={hoveredPlaceId}
      onSelectPlace={selectPlace}
      onHoverPlace={setHoveredPlaceId}
      onShowCategory={showCategory}
      onClosePlace={closePlace}
      onSharePlace={sharePlace}
    />
  );

  return (
    <div className={isCompact ? "app app--compact" : "app"} style={layoutStyle}>
      <Suspense fallback={<div className="map-placeholder" aria-hidden="true" />}>
        <MapView
          explorer={explorer}
          visiblePlaces={visiblePlaces}
          hoveredPlaceId={hoveredPlaceId}
          padding={padding}
          theme={theme}
          onSelectPlace={selectPlace}
          onHoverPlace={setHoveredPlaceId}
        />
      </Suspense>

      <header ref={topbarRef} className="topbar">
        <div className="topbar__search">
          <SearchBox onSelectPlace={selectPlace} onShowCategory={showCategory} onShowSkills={showSkills} />
        </div>
        <CategoryChips activeCategoryId={explorer.categoryId} onShowCategory={showCategory} />
        <div className="topbar__actions">
          {!isCompact && <SocialLinks className="social-links--floating" />}
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      {isCompact ? (
        <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap} label={panelLabel(explorer)} contentKey={contentKey}>
          {panelContent}
        </BottomSheet>
      ) : (
        <Sidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen((open) => !open)}
          label={panelLabel(explorer)}
          contentKey={contentKey}
        >
          {panelContent}
        </Sidebar>
      )}

      <Toast message={toastMessage} />
    </div>
  );
}
