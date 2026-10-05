import { Earth, LocateFixed, Minus, Navigation2, Plus } from "lucide-react";
import { IconButton } from "../components/IconButton";

interface MapControlsProps {
  readonly bearing: number;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onResetNorth: () => void;
  readonly onRecenter: () => void;
  readonly onShowGlobe: () => void;
}

export function MapControls({ bearing, onZoomIn, onZoomOut, onResetNorth, onRecenter, onShowGlobe }: MapControlsProps) {
  return (
    <div className="map-controls" role="toolbar" aria-label="Map controls">
      <div className="map-controls__group">
        <IconButton label="Globe view" onClick={onShowGlobe}>
          <Earth size={18} />
        </IconButton>
        <IconButton label="Back to current view" onClick={onRecenter}>
          <LocateFixed size={18} />
        </IconButton>
      </div>
      <div className="map-controls__group">
        <IconButton label="Reset to north" onClick={onResetNorth}>
          <Navigation2 size={18} style={{ transform: `rotate(${-bearing}deg)` }} className="map-controls__compass" />
        </IconButton>
      </div>
      <div className="map-controls__group">
        <IconButton label="Zoom in" onClick={onZoomIn}>
          <Plus size={18} />
        </IconButton>
        <IconButton label="Zoom out" onClick={onZoomOut}>
          <Minus size={18} />
        </IconButton>
      </div>
    </div>
  );
}
