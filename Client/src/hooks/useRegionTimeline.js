import { useEffect, useState } from "react";
import { fetchRegionTimeline } from "../services/temperatureApi";

// Timeline for the selected region. With no region selected the global
// series (already loaded) is used, so the chart, statistics and globe always
// describe the same selection.
export function useRegionTimeline(regionId, globalData) {
  const [state, setState] = useState({ regionId: null, status: "idle", data: null, error: null });

  useEffect(() => {
    if (!regionId) return;
    let cancelled = false;
    fetchRegionTimeline(regionId)
      .then((data) => !cancelled && setState({ regionId, status: "ready", data, error: null }))
      .catch((err) => !cancelled && setState({ regionId, status: "error", data: null, error: err.message }));
    return () => { cancelled = true; };
  }, [regionId]);

  if (!globalData) return { status: "idle", data: null, error: null };

  if (!regionId) {
    return {
      status: "ready",
      error: null,
      data: {
        region: { id: "GLOBAL", name: "Global", level: "global", parentId: null },
        years: globalData.years,
        series: globalData.series,
        summary: globalData.summary,
        parent: null,
        global: { series: globalData.series, summary: globalData.summary },
        coverage: null,
        notes: globalData.notes,
        meta: globalData.meta,
      },
    };
  }
  if (state.regionId !== regionId) return { status: "loading", data: null, error: null };
  return state;
}
