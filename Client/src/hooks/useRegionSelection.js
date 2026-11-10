import { useCallback, useRef, useState } from "react";
import { fetchBoundary } from "../services/boundaryApi";
import { locateRegion } from "../services/regionApi";

const EMPTY = { region: null, boundary: null, loading: false, error: null, notice: null };

// Single source of truth for "what is selected". The boundary feature is
// loaded here so the globe layer, side panel and (later) charts all see the
// same region. A request counter discards stale responses when the user
// clicks quickly.
export function useRegionSelection() {
  const [state, setState] = useState(EMPTY);
  const requestId = useRef(0);

  const load = useCallback(async (resolveSummary) => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null, notice: null }));
    try {
      const summary = await resolveSummary();
      if (id !== requestId.current) return;
      if (!summary) {
        setState((s) => ({
          ...s,
          loading: false,
          notice: "No country boundary at this point (open ocean, or not in the dataset).",
        }));
        return;
      }
      const feature = await fetchBoundary(summary.id);
      if (id !== requestId.current) return;
      setState({ region: feature.properties, boundary: feature, loading: false, error: null, notice: null });
    } catch (err) {
      if (id !== requestId.current) return;
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  const selectRegion = useCallback((summary) => load(async () => summary), [load]);

  const selectByCoordinates = useCallback(
    (lat, lon) => load(async () => (await locateRegion(lat, lon, { level: "country" })).data),
    [load]
  );

  const clear = useCallback(() => {
    requestId.current++;
    setState(EMPTY);
  }, []);

  return { ...state, selectRegion, selectByCoordinates, clear };
}
