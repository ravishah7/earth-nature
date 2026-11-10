import { useCallback, useEffect, useRef } from "react";
import { ImageryLayer, Rectangle, SingleTileImageryProvider } from "cesium";

import { renderFrameToCanvas } from "../../utils/temperatureRaster";

// Draws the anomaly heatmap on the globe as ONE imagery layer per year
// (a 1° grid rasterised to a small image), not thousands of entities.
// Between two years the layers are cross-faded using the fractional timeline
// position, which gives the smooth colour transition. Layer alphas follow the
// exact compositing maths below so the blend is a true mix of the two years
// (no dip in opacity half-way, no bleed of the previous year).
function TemperatureLayer({ viewer, data, timeline, opacity = 0.8 }) {
  const stateRef = useRef(null); // { years, layers }

  const apply = useCallback(
    (position) => {
      const s = stateRef.current;
      if (!s) return;
      const { years, layers } = s;
      const f = Math.min(Math.max(position - years[0], 0), years.length - 1);
      const i = Math.floor(f);
      const t = f - i;

      layers.forEach((layer, k) => {
        if (k === i) {
          // Lower layer: alpha chosen so that, after the upper layer is
          // blended on top, its share of the final colour is opacity·(1−t).
          const denom = 1 - opacity * t;
          layer.alpha = denom > 1e-6 ? (opacity * (1 - t)) / denom : 0; // 0/0 guard at opacity 1, t 1
          layer.show = true;
        } else if (k === i + 1 && t > 0.001) {
          layer.alpha = opacity * t;
          layer.show = true;
        } else {
          layer.show = false;
        }
      });
    },
    [opacity]
  );

  // Build the per-year layers when the data arrives.
  useEffect(() => {
    if (!viewer || !data) return;

    // Day/night shading would hide data on the night side; a scientific
    // layer must be readable everywhere, so lighting is off while it shows.
    const previousLighting = viewer.scene.globe.enableLighting;
    viewer.scene.globe.enableLighting = false;

    const layers = data.years.map((year) => {
      const canvas = renderFrameToCanvas({
        frame: data.frames[year],
        baseline: data.baseline,
        grid: data.grid,
        encoding: data.encoding,
      });
      const provider = SingleTileImageryProvider.fromUrl(canvas.toDataURL("image/png"), {
        rectangle: Rectangle.MAX_VALUE, // the grid spans the whole globe
      });
      const layer = ImageryLayer.fromProviderAsync(provider, { alpha: 0, show: false });
      viewer.imageryLayers.add(layer);
      return layer;
    });

    stateRef.current = { years: data.years, layers };
    apply(timeline.getPosition());

    return () => {
      stateRef.current = null;
      if (viewer.isDestroyed()) return;
      layers.forEach((l) => viewer.imageryLayers.remove(l, true));
      viewer.scene.globe.enableLighting = previousLighting;
    };
    // `timeline` and `apply` are intentionally not dependencies: rebuilding
    // all layers on every opacity change would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, data]);

  // Follow the timeline (called every animation frame while playing).
  useEffect(() => timeline.subscribe(apply), [timeline, apply]);

  // Re-apply on opacity change or when the layers were just (re)built.
  useEffect(() => {
    apply(timeline.getPosition());
  }, [apply, timeline, data]);

  return null;
}

export default TemperatureLayer;
