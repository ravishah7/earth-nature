import { useEffect, useId, useState } from "react";
import { Search } from "lucide-react";
import { searchRegions } from "../../services/regionApi";

// Debounced search box with keyboard navigation (↑ ↓ Enter Esc).
function RegionSearch({ onSelect, level = "country", placeholder = "Search countries…" }) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const { data } = await searchRegions(q, { level, signal: controller.signal });
        setResults(data);
        setActive(0);
        setStatus("done");
      } catch (err) {
        if (err.name !== "AbortError") setStatus("error");
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, level]);

  const choose = (region) => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onSelect(region);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && query.trim().length >= 2;

  return (
    <div className="region-search">
      <Search size={15} className="region-search-icon" />
      <input
        type="search"
        value={query}
        placeholder={placeholder}
        aria-label="Search regions"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        autoComplete="off"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul id={listId} role="listbox" className="region-search-list">
          {status === "loading" && results.length === 0 && <li className="region-search-note">Searching…</li>}
          {status === "error" && <li className="region-search-note">Search unavailable — is the server running?</li>}
          {status === "done" && results.length === 0 && <li className="region-search-note">No matches</li>}
          {results.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => e.preventDefault()} // keep input focused so click registers
              onClick={() => choose(r)}
              onMouseEnter={() => setActive(i)}
            >
              <span>{r.name}</span>
              <small>{r.level === "country" ? r.continent : `${r.type ?? "Division"} · ${r.parentName}`}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default RegionSearch;
