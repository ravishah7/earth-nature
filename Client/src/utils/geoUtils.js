import { Cartesian3, Rectangle } from "cesium";

// Same camera position the globe has always started from.
export const INITIAL_VIEW = { lon: 15, lat: 20, height: 26000000 };

// bbox = [west, south, east, north] in degrees. Adds margin and a minimum
// span so tiny countries don't zoom to street level.
export function padBbox([w, s, e, n], { ratio = 0.15, minSpan = 1 } = {}) {
  const dx = Math.max(e - w, minSpan);
  const dy = Math.max(n - s, minSpan);
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const hx = dx * (0.5 + ratio);
  const hy = dy * (0.5 + ratio);
  return [
    Math.max(cx - hx, -180),
    Math.max(cy - hy, -85),
    Math.min(cx + hx, 180),
    Math.min(cy + hy, 85),
  ];
}

export function flyToBbox(viewer, bbox, { duration = 1.8, ratio } = {}) {
  if (!viewer || viewer.isDestroyed() || !bbox) {
    console.warn("[geoUtils] flyToBbox skipped", { hasViewer: !!viewer, bbox });
    return;
  }
  const [w, s, e, n] = padBbox(bbox, ratio === undefined ? undefined : { ratio });
  viewer.camera.flyTo({ destination: Rectangle.fromDegrees(w, s, e, n), duration });
}

export function flyHome(viewer, { duration = 1.8 } = {}) {
  if (!viewer || viewer.isDestroyed()) return;
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(INITIAL_VIEW.lon, INITIAL_VIEW.lat, INITIAL_VIEW.height),
    duration,
  });
}
