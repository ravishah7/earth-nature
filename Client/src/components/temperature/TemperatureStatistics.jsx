import { TrendingUp } from "lucide-react";
import { anomalyToCss } from "../../utils/temperatureColor";

const sign = (v, d = 2) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d)} °C`);

// Side-panel numbers for the selected region and year.
function TemperatureStatistics({ timelineData, year, status, error }) {
  if (status === "loading") return <section className="location-panel"><p className="region-status">Calculating regional statistics…</p></section>;
  if (status === "error") return <section className="location-panel"><p className="region-status region-error" role="alert">{error}</p></section>;
  if (!timelineData) return null;

  const { series, summary, coverage, notes, meta, region } = timelineData;
  const row = series.find((s) => s.year === year);
  const { periods, trend } = summary;

  return (
    <section className="location-panel temp-stats">
      <div className="panel-heading">
        <div className="panel-icon"><TrendingUp size={19} /></div>
        <div>
          <p className="eyebrow">TEMPERATURE · {region.name.toUpperCase()}</p>
          <h2>{year}</h2>
        </div>
      </div>

      <dl className="region-facts">
        <div className="wide">
          <dt>ANOMALY IN {year}</dt>
          <dd className="big" style={{ color: row?.anomaly == null ? undefined : anomalyToCss(row.anomaly) }}>
            {row?.anomaly == null ? "No data" : sign(row.anomaly)}
          </dd>
        </div>
        <div><dt>ANNUAL MEAN (2 m AIR)</dt><dd>{row?.meanTemp == null ? "—" : `${row.meanTemp.toFixed(1)} °C`}</dd></div>
        <div><dt>BASELINE MEAN</dt><dd>{row?.baselineTemp == null ? "—" : `${row.baselineTemp.toFixed(1)} °C`}</dd></div>
        <div>
          <dt>HISTORICAL AVG {periods.historical.startYear ?? ""}–{periods.historical.endYear ?? ""}</dt>
          <dd>{sign(periods.historical.meanAnomaly)}</dd>
        </div>
        <div>
          <dt>RECENT AVG {periods.recent.startYear ?? ""}–{periods.recent.endYear ?? ""}</dt>
          <dd>{periods.recent.enough ? sign(periods.recent.meanAnomaly) : "Not enough data"}</dd>
        </div>
        <div className="wide">
          <dt>LINEAR TREND ({trend ? `${trend.startYear}–${trend.endYear}` : "—"})</dt>
          <dd>
            {trend
              ? `${sign(trend.perDecade)} per decade${trend.stdErrPerDecade != null ? ` (± ${trend.stdErrPerDecade.toFixed(2)} s.e.)` : ""}`
              : "Too few valid years"}
          </dd>
        </div>
      </dl>

      {coverage && (
        <p className="region-hint">
          Area-weighted mean of {coverage.effectiveCells.toFixed(1)} grid-cell equivalents ({coverage.cellDeg}° cells).
        </p>
      )}
      {notes?.map((n) => <p key={n} className="region-status region-warn">⚠ {n}</p>)}

      <p className="region-attribution">
        <b>Source:</b> NASA POWER (MERRA-2) T2M — air temperature at 2 m, not land-surface temperature.
        <br /><b>Baseline:</b> {meta.baseline}. <b>Resolution:</b> {meta.resolution}.
        <br />Trends are descriptive and do not by themselves establish cause.{" "}
        <a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">power.larc.nasa.gov</a>
      </p>
    </section>
  );
}

export default TemperatureStatistics;
