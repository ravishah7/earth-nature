const sign = (v) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}`);

// Region vs parent country vs global: recent average and trend side by side.
function TemperatureComparison({ timelineData }) {
  if (!timelineData || timelineData.region.level === "global") return null;
  const rows = [
    { name: timelineData.region.name, s: timelineData.summary },
    timelineData.parent && { name: timelineData.parent.name, s: timelineData.parent.summary },
    { name: "Global", s: timelineData.global.summary },
  ].filter(Boolean);

  return (
    <table className="temp-compare">
      <thead>
        <tr><th></th><th>Recent avg (°C)</th><th>Trend (°C/decade)</th></tr>
      </thead>
      <tbody>
        {rows.map(({ name, s }) => (
          <tr key={name}>
            <td>{name}</td>
            <td>{s.periods.recent.enough ? sign(s.periods.recent.meanAnomaly) : "—"}</td>
            <td>{s.trend ? sign(s.trend.perDecade) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default TemperatureComparison;
