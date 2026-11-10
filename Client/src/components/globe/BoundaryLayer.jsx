import { useEffect, useRef } from "react";
import {
  Cartesian3,
  ClassificationType,
  Color,
  CustomDataSource,
  PolygonHierarchy,
} from "cesium";

import { flyHome, flyToBbox } from "../../utils/geoUtils";

const OUTLINE = Color.fromCssColorString("#65d7ff");
const FILL = OUTLINE.withAlpha(0.14);

const toPositions = (ring) => Cartesian3.fromDegreesArray(ring.flat());
const touchesPole = (ring) => ring.some(([, lat]) => Math.abs(lat) >= 89.9);

// Draws one GeoJSON Polygon/MultiPolygon: a terrain-draped translucent fill
// plus a ground-clamped outline per ring.
function drawGeometry(entities, geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  for (const [outer, ...holes] of polygons) {
    // Rings that run along a pole (Antarctica) cannot be filled correctly
    // on a globe; draw the outline only.
    if (!touchesPole(outer)) {
      entities.add({
        polygon: {
          hierarchy: new PolygonHierarchy(
            toPositions(outer),
            holes.map((h) => new PolygonHierarchy(toPositions(h)))
          ),
          material: FILL,
          classificationType: ClassificationType.TERRAIN,
        },
      });
    }
    for (const ring of [outer, ...holes]) {
      entities.add({
        polyline: {
          positions: toPositions(ring),
          width: 2,
          material: OUTLINE,
          clampToGround: true,
        },
      });
    }
  }
}

// Renders the selected region's boundary and moves the camera to it.
// `boundary` is a GeoJSON Feature from /api/regions/:id/boundary.
function BoundaryLayer({ viewer, boundary }) {
  const dataSourceRef = useRef(null);
  const hadBoundary = useRef(false);

  // One data source per viewer.
  useEffect(() => {
    if (!viewer) return;
    const ds = new CustomDataSource("selected-boundary");
    viewer.dataSources.add(ds);
    dataSourceRef.current = ds;
    return () => {
      dataSourceRef.current = null;
      if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
    };
  }, [viewer]);

  // Fly + redraw whenever the selection changes.
  useEffect(() => {
    const ds = dataSourceRef.current;
    if (!viewer || !ds) return;

    // Move the camera FIRST so a problem while drawing the outline can
    // never stop the zoom from happening.
    if (boundary) {
      hadBoundary.current = true;
      flyToBbox(viewer, boundary.properties.focusBbox ?? boundary.properties.bbox);
    } else if (hadBoundary.current) {
      hadBoundary.current = false;
      flyHome(viewer); // "Back to global view"
    }

    // Batch the many entities so Cesium updates once.
    ds.entities.suspendEvents();
    try {
      ds.entities.removeAll();
      if (boundary) drawGeometry(ds.entities, boundary.geometry);
    } catch (err) {
      console.error("[BoundaryLayer] could not draw boundary", err);
    } finally {
      ds.entities.resumeEvents();
    }
  }, [viewer, boundary]);

  return null;
}

export default BoundaryLayer;
