
import { useState, useCallback } from "react";

import EarthGlobe from "./components/globe/EarthGlobe";
import Navbar from "./components/layout/Navbar";
import LocationPanel from "./components/layout/LocationPanel";

import "./App.css";

function App() {
  const [location, setLocation] = useState(null);

  // Keep the callback stable so Cesium doesn't
  // unnecessarily recreate the globe.
  const handleLocationSelect = useCallback((coordinates) => {
    setLocation(coordinates);
  }, []);

  return (
    <main className="app-shell">

      {/* Interactive 3D Earth */}
      <EarthGlobe
        onLocationSelect={handleLocationSelect}
      />

      {/* Website interface */}
      <div className="interface-overlay">

        <Navbar />

        <div className="left-content">
          <div className="hero-label">
            <span className="hero-line" />
            OUR PLANET, YOUR EXPLORATION
          </div>

          <h2 className="hero-title">
            Discover
            <br />
            <span>Earth.</span>
          </h2>

          <p className="hero-description">
            From the highest mountains to the
            deepest forests. Explore the natural
            wonders of our extraordinary planet.
          </p>

          <LocationPanel location={location} />
        </div>

        <div className="bottom-content">
          <span>01 / ONE PLANET</span>
          <span>EXPLORE WITHOUT LIMITS</span>
        </div>

      </div>
    </main>
  );
}

export default App;
