
import { useState, useCallback } from "react";

import EarthGlobe from "./components/globe/EarthGlobe";
import BoundaryLayer from "./components/globe/BoundaryLayer";
import Navbar from "./components/layout/Navbar";
import LocationPanel from "./components/layout/LocationPanel";
import RegionSearch from "./components/geography/RegionSearch";
import RegionSelector from "./components/geography/RegionSelector";
import RegionPanel from "./components/dashboard/RegionPanel";
import TemperatureLayer from "./components/globe/TemperatureLayer";
import TemperatureLegend from "./components/temperature/TemperatureLegend";
import TemperatureStatistics from "./components/temperature/TemperatureStatistics";
import TemperatureDashboard from "./components/dashboard/TemperatureDashboard";
import { useTemperatureData } from "./hooks/useTemperatureData";
import { useTimeline } from "./hooks/useTimeline";
import { useRegionTimeline } from "./hooks/useRegionTimeline";
import { useRegionSelection } from "./hooks/useRegionSelection";
import { flyHome, flyToBbox } from "./utils/geoUtils";
import EarthCopilot from "./components/ai/EarthCopilot";
import "./styles/copilot.css";

import "./App.css";
import "./styles/geography.css";
import "./styles/temperature.css";

function App() {
  const [location, setLocation] = useState(null);
  const [viewer, setViewer] = useState(null);
  const selection = useRegionSelection();
  const { selectByCoordinates, selectRegion, clear } = selection;

  // Temperature: one dataset, one timeline, one selected region — the globe,
  // chart and statistics all read from these, so they can never disagree.
  const temperature = useTemperatureData();
  const years = temperature.data?.years;
  const timeline = useTimeline({ min: years?.[0] ?? 2001, max: years?.at(-1) ?? 2025 });
  const regionTimeline = useRegionTimeline(selection.region?.id ?? null, temperature.data);

  // Clicking the globe records the coordinates (existing behaviour) and
  // resolves which country contains the point.
  const handleLocationSelect = useCallback((coordinates) => {
    setLocation(coordinates);
    selectByCoordinates(coordinates.latitude, coordinates.longitude);
  }, [selectByCoordinates]);

  // Choosing a continent only moves the camera; continents have no boundary.
  const handleContinentFocus = useCallback((continent) => {
    if (continent?.focusBbox) flyToBbox(viewer, continent.focusBbox, { ratio: 0.05 });
    else flyHome(viewer);
  }, [viewer]);

  return (
    <main className="app-shell">

      {/* Interactive 3D Earth */}
      <EarthGlobe
        onLocationSelect={handleLocationSelect}
        onViewerReady={setViewer}
      />

      {/* Selected region outline + camera movement */}
      <BoundaryLayer viewer={viewer} boundary={selection.boundary} />

      {/* Year-by-year anomaly heatmap (one imagery layer per year, cross-faded) */}
      <TemperatureLayer viewer={viewer} data={temperature.data} timeline={timeline} />

      {/* Website interface */}
      <div className="interface-overlay">

        <Navbar />

        <div className="left-content geo-column">
          <RegionSearch onSelect={selectRegion} />

          <RegionSelector
            selectedRegion={selection.region}
            onSelect={selectRegion}
            onContinentFocus={handleContinentFocus}
          />

          <RegionPanel
            region={selection.region}
            loading={selection.loading}
            error={selection.error}
            notice={selection.notice}
            onReset={clear}
          />

          <TemperatureStatistics
            timelineData={regionTimeline.data}
            year={timeline.year}
            status={regionTimeline.status}
            error={regionTimeline.error}
          />

          <LocationPanel location={location} />
        </div>

        {temperature.status === "ready" && (
          <TemperatureLegend
            baselineLabel={temperature.data.meta.baseline.replace(" mean of each grid cell", "")}
          />
        )}

        <TemperatureDashboard
          temperature={temperature}
          timeline={timeline}
          regionTimeline={regionTimeline}
        />

        <EarthCopilot
          regionId={selection.region?.id ?? null}
          regionName={selection.region?.name ?? ""}
        />

      </div>
    </main>
  );
}

export default App;
