import { useEffect, useState } from "react";
import { fetchGlobalTemperature } from "../services/temperatureApi";

// status: loading | ready | unavailable (dataset not built) | error
export function useTemperatureData() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fetchGlobalTemperature()
      .then((data) => !cancelled && setState({ status: "ready", data, error: null }))
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: err.code === "TEMPERATURE_DATA_NOT_BUILT" ? "unavailable" : "error",
          data: null,
          error: err.message,
        });
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}
