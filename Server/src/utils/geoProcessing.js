// Pure geometry helpers (no I/O). Coordinates are GeoJSON [lon, lat].

export function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

export function bboxOfPolygon(polygon) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lon, lat] of polygon[0]) {
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [w, s, e, n];
}

export function unionBbox(a, b) {
  if (!a) return b;
  if (!b) return a;
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

export function bboxOfGeometry(geometry) {
  return polygonsOf(geometry).reduce(
    (acc, poly) => unionBbox(acc, bboxOfPolygon(poly)),
    null
  );
}

export function bboxContains(bbox, lon, lat) {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

// Approximate planar ring area in "equal-area-ish" square degrees
// (shoelace, scaled by cos(mean latitude)). Only used to RANK polygons
// against each other — never reported as a real area.
function ringArea(ring) {
  let twiceArea = 0;
  let latSum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    twiceArea += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    latSum += ring[i][1];
  }
  const meanLat = latSum / ring.length;
  return (Math.abs(twiceArea) / 2) * Math.cos((meanLat * Math.PI) / 180);
}

function polygonArea(polygon) {
  let area = ringArea(polygon[0]);
  for (const hole of polygon.slice(1)) area -= ringArea(hole);
  return Math.max(area, 0);
}

// Bounding box of the "main" polygons only, so that e.g. France is framed on
// Europe rather than stretched to include French Guiana, and the USA on the
// contiguous states rather than Hawaii. Never wraps the antimeridian.
export function focusBboxOfGeometry(geometry, ratio = 0.25) {
  const polys = polygonsOf(geometry);
  if (polys.length === 0) return null;
  const areas = polys.map(polygonArea);
  const max = Math.max(...areas);
  let box = null;
  polys.forEach((poly, i) => {
    if (areas[i] >= max * ratio) box = unionBbox(box, bboxOfPolygon(poly));
  });
  return box ?? bboxOfGeometry(geometry);
}

// Ray casting. Holes are excluded.
export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygon(lon, lat, polygon) {
  if (!pointInRing(lon, lat, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) {
    if (pointInRing(lon, lat, polygon[h])) return false;
  }
  return true;
}

export function pointInGeometry(lon, lat, geometry) {
  return polygonsOf(geometry).some((poly) => pointInPolygon(lon, lat, poly));
}

// Round coordinates, drop consecutive duplicates and degenerate rings.
export function roundGeometry(geometry, decimals = 4) {
  const f = 10 ** decimals;
  const roundRing = (ring) => {
    const out = [];
    let px, py;
    for (const [x, y] of ring) {
      const rx = Math.round(x * f) / f;
      const ry = Math.round(y * f) / f;
      if (rx === px && ry === py) continue;
      out.push([rx, ry]);
      px = rx;
      py = ry;
    }
    if (out.length && (out[0][0] !== out.at(-1)[0] || out[0][1] !== out.at(-1)[1])) {
      out.push([...out[0]]);
    }
    return out.length >= 4 ? out : null;
  };
  const polys = [];
  for (const poly of polygonsOf(geometry)) {
    const outer = roundRing(poly[0]);
    if (!outer) continue;
    polys.push([outer, ...poly.slice(1).map(roundRing).filter(Boolean)]);
  }
  if (polys.length === 0) return null;
  return polys.length === 1
    ? { type: "Polygon", coordinates: polys[0] }
    : { type: "MultiPolygon", coordinates: polys };
}
