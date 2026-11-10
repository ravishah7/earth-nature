import { useMemo, useState } from "react";
import {
  CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { anomalyToCss } from "../../utils/temperatureColor";

const fmt = (v, d = 2) => (v === null || v === undefined ? "no data" : `${v > 0 ? "+" : ""}${v.toFixed(d)} °C`);

function ChartTooltip({ active, payload, label, mode }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <b>{label}</b>
      {row.regionName && (
        <p>
          {row.regionName}:{" "}
          {mode === "anomaly" ? fmt(row.region) : row.region === null ? "no data" : `${row.region.toFixed(2)} °C`}
        </p>
      )}
      {row.parentName && row.parent !== null && <p>{row.parentName}: {fmt(row.parent)}</p>}
      {mode === "anomaly" && row.global !== null && <p>Global: {fmt(row.global)}</p>}
      {row.region === null && <p className="chart-tooltip-missing">Insufficient valid data — not estimated</p>}
    </div>
  );
}

// Dots take their colour from the same scale as the globe.
function ColorDot({ cx, cy, value, payload }) {
  if (cx === undefined || value === null || value === undefined) return null;
  const color = payload.mode === "anomaly" ? anomalyToCss(value) : "#65d7ff";
  return <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="#0a1623" strokeWidth={1} />;
}

function TemperatureChart({ timelineData, selectedYear, baselineLabel }) {
  const [mode, setMode] = useState("anomaly"); // anomaly | mean
  const [compare, setCompare] = useState(true);

  const { rows, missing, yDomain } = useMemo(() => {
    const { series, parent, global, region, summary } = timelineData;
    const key = mode === "anomaly" ? "anomaly" : "meanTemp";
    const parentByYear = parent ? new Map(parent.series.map((s) => [s.year, s])) : null;
    const globalByYear = new Map(global.series.map((s) => [s.year, s]));
    const trend = summary.trend;
    const slope = trend ? (trend.line[1].value - trend.line[0].value) / (trend.line[1].year - trend.line[0].year) : 0;

    const built = series.map((s) => ({
      year: s.year,
      region: s[key],
      parent: parentByYear ? parentByYear.get(s.year)?.[key] ?? null : null,
      global: mode === "anomaly" ? globalByYear.get(s.year)?.anomaly ?? null : null,
      trend: mode === "anomaly" && trend && s.year >= trend.startYear && s.year <= trend.endYear
        ? trend.line[0].value + slope * (s.year - trend.line[0].year) : null,
      regionName: region.name,
      parentName: parent?.name,
      mode,
    }));
    const values = built.flatMap((r) => [r.region, compare ? r.parent : null, compare ? r.global : null]).filter((v) => v !== null);
    const pad = 0.3;
    const domain = values.length ? [Math.floor((Math.min(...values) - pad) * 2) / 2, Math.ceil((Math.max(...values) + pad) * 2) / 2] : [-1, 1];
    return { rows: built, missing: series.filter((s) => s.anomaly === null), yDomain: domain };
  }, [timelineData, mode, compare]);

  const { region, parent, summary } = timelineData;
  const baselineMean = summary.periods.baseline.meanTemp;

  return (
    <div className="temp-chart">
      <div className="chart-toolbar">
        <div>
          <p className="eyebrow">{region.name.toUpperCase()}</p>
          <h3>{mode === "anomaly" ? "Annual temperature anomaly" : "Annual mean air temperature (2 m)"}</h3>
        </div>
        <div className="chart-toggles">
          <button type="button" className={mode === "anomaly" ? "on" : ""} onClick={() => setMode("anomaly")}>Anomaly</button>
          <button type="button" className={mode === "mean" ? "on" : ""} onClick={() => setMode("mean")}>Annual mean</button>
          <label><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare</label>
        </div>
      </div>

      <div className="chart-area">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis dataKey="year" type="number" domain={["dataMin", "dataMax"]} tickCount={7} stroke="#7f95a8" fontSize={10} allowDecimals={false} />
            <YAxis domain={yDomain} stroke="#7f95a8" fontSize={10} width={44} tickFormatter={(v) => v.toFixed(1)}
              label={{ value: "°C", position: "insideTopLeft", fill: "#7f95a8", fontSize: 10, dy: -4 }} />
            <Tooltip content={<ChartTooltip mode={mode} />} />
            {mode === "anomaly" ? (
              <ReferenceLine y={0} stroke="#9ba9b7" strokeDasharray="4 3" label={{ value: `Baseline (${baselineLabel})`, fill: "#9ba9b7", fontSize: 9, position: "insideBottomRight" }} />
            ) : baselineMean !== null && (
              <ReferenceLine y={baselineMean} stroke="#9ba9b7" strokeDasharray="4 3" label={{ value: "Baseline-period mean", fill: "#9ba9b7", fontSize: 9, position: "insideBottomRight" }} />
            )}
            <ReferenceLine x={selectedYear} stroke="#65d7ff" strokeWidth={1.5} />
            {compare && mode === "anomaly" && <Line dataKey="global" name="Global" stroke="#8aa0b4" strokeWidth={1.2} strokeDasharray="2 3" dot={false} connectNulls={false} isAnimationActive={false} />}
            {compare && parent && <Line dataKey="parent" name={parent.name} stroke="#c9a7ff" strokeWidth={1.4} dot={false} connectNulls={false} isAnimationActive={false} />}
            {mode === "anomaly" && <Line dataKey="trend" name="Linear trend" stroke="#ffffff" strokeOpacity={0.55} strokeDasharray="6 4" strokeWidth={1.2} dot={false} connectNulls isAnimationActive={false} />}
            <Line dataKey="region" name={region.name} stroke="#65d7ff" strokeWidth={2} dot={<ColorDot />} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="chart-footnote">
        {missing.length > 0
          ? `Gaps = insufficient valid data (${missing.map((m) => m.year).join(", ")}); nothing is estimated. `
          : "No gaps in this range. "}
        Dashed white line: descriptive linear trend — not evidence of cause.
      </p>
    </div>
  );
}

export default TemperatureChart;
