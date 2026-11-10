import { useEffect, useState } from "react";
import { fetchCountries } from "../../services/regionApi";

// Country dropdown, optionally limited to one continent.
function CountrySelector({ continentId = "", value = "", onSelect }) {
  const [countries, setCountries] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCountries(continentId)
      .then((list) => { if (!cancelled) { setCountries(list); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [continentId]);

  return (
    <label className="geo-field">
      <span>COUNTRY</span>
      <select
        value={value}
        disabled={error}
        onChange={(e) => {
          const c = countries.find((x) => x.id === e.target.value);
          if (c) onSelect(c);
        }}
      >
        <option value="">{error ? "Unavailable" : "Select a country…"}</option>
        {/* Keep the selection visible even if it is outside the continent filter */}
        {value && !countries.some((c) => c.id === value) && <option value={value}>{value}</option>}
        {countries.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </label>
  );
}

export default CountrySelector;
