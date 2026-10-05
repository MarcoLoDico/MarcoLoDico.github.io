import type { CSSProperties } from "react";
import { getCategory } from "../content/categories";
import type { ClusterMarker } from "./useMarkerSnapshot";

interface ClusterPinProps {
  readonly cluster: ClusterMarker;
  readonly onExpand: (cluster: ClusterMarker) => void;
}

function categoryRingGradient(cluster: ClusterMarker): string {
  let start = 0;
  const stops = cluster.shares.map((share) => {
    const end = start + (share.count / cluster.count) * 360;
    const stop = `${getCategory(share.categoryId).color} ${start}deg ${end}deg`;
    start = end;
    return stop;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

export function ClusterPin({ cluster, onExpand }: ClusterPinProps) {
  const style: CSSProperties = { "--cluster-ring": categoryRingGradient(cluster) };
  const summary = cluster.shares
    .map((share) => `${share.count} ${getCategory(share.categoryId).label.toLowerCase()}`)
    .join(", ");

  return (
    <button
      type="button"
      className="cluster-pin"
      style={style}
      aria-label={`${cluster.count} places: ${summary}. Zoom in`}
      title={summary}
      onClick={() => onExpand(cluster)}
    >
      <span className="cluster-pin__count">{cluster.count}</span>
    </button>
  );
}
