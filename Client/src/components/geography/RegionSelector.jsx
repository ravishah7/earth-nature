import { useEffect, useState } from "react";
import { fetchContinents } from "../../services/regionApi";
import CountrySelector from "./CountrySelector";

// Global → Continent → Country. (State/province level is added in Milestone 2.)
function RegionSelector({ selectedRegion, onSelect, onContinentFocus }) {
  const [continents, setContinents] = useState([]);
  const [continentId, setContinentId] = useState("");

  useEffect(() => {
    fetchContinents().then(setContinents).catch(() => setContinents([]));
  }, []);

  // Follow selections made via search or by clicking the globe.
  useEffect(() => {
    if (selectedRegion?.continentId) setContinentId(selectedRegion.continentId);
  }, [selectedRegion?.continentId]);

  const handleContinent = (e) => {
    const id = e.target.value;
    setContinentId(id);
    onContinentFocus?.(continents.find((c) => c.id === id) ?? null);
  };

  return (
    <div className="geo-selectors">
      <label className="geo-field">
        <span>CONTINENT</span>
        <select value={continentId} onChange={handleContinent}>
          <option value="">All continents</option>
          {continents.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.countryCount})</option>
          ))}
        </select>
      </label>

      <CountrySelector
        continentId={continentId}
        value={selectedRegion?.level === "country" ? selectedRegion.id : ""}
        onSelect={onSelect}
      />
    </div>
  );
}

export default RegionSelector;
