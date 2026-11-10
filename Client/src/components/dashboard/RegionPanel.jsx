import { Globe2, Info, TriangleAlert } from "lucide-react";

const LEVEL_LABEL = { country: "Country", admin1: "State / province" };

// Side panel for the selected region. Temperature statistics are added in
// Milestone 3; nothing here is placeholder data.
function RegionPanel({ region, loading, error, notice, onReset }) {
  return (
    <section className="location-panel region-panel" aria-live="polite">
      <div className="panel-heading">
        <div className="panel-icon"><Globe2 size={19} /></div>
        <div>
          <p className="eyebrow">SELECTED REGION</p>
          <h2>{region ? region.name : "Global view"}</h2>
        </div>
      </div>

      {loading && <p className="region-status">Loading boundary…</p>}
      {error && (
        <p className="region-status region-error" role="alert">
          <TriangleAlert size={14} /> {error}
        </p>
      )}
      {notice && !loading && <p className="region-status"><Info size={14} /> {notice}</p>}

      {region ? (
        <dl className="region-facts">
          <div><dt>LEVEL</dt><dd>{LEVEL_LABEL[region.level] ?? region.level}</dd></div>
          <div><dt>CODE</dt><dd>{region.iso3 ?? region.iso3166_2 ?? region.id}</dd></div>
          <div><dt>CONTINENT</dt><dd>{region.continent}</dd></div>
          {region.subregion && <div><dt>SUBREGION</dt><dd>{region.subregion}</dd></div>}
          {region.level === "country" && (
            <div className="wide">
              <dt>FIRST-LEVEL DIVISIONS</dt>
              <dd>
                {region.adminDivisionsAvailable
                  ? `${region.divisionCount} boundaries available`
                  : "No boundaries in the Natural Earth dataset for this country"}
              </dd>
            </div>
          )}
        </dl>
      ) : (
        !loading && (
          <p className="region-hint">
            Click a country on the globe, pick one from the lists, or search by name.
          </p>
        )
      )}

      {region && (
        <button type="button" className="region-reset" onClick={onReset}>
          ← Back to global view
        </button>
      )}

      <p className="region-attribution">
        Boundaries: Natural Earth (public domain), 1:10m generalised — approximate, not survey-grade.
      </p>
    </section>
  );
}

export default RegionPanel;
