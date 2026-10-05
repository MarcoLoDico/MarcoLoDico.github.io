import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * MapLibre resolves its worker relative to its own module URL, which no longer
 * holds once the library is bundled, so the worker is bundled separately here.
 * Runtime MapLibre classes are imported through this module to guarantee the
 * worker URL is set before the first map is created.
 */
setWorkerUrl(workerUrl);

export { MapLibreMap, Marker } from "maplibre-gl";
