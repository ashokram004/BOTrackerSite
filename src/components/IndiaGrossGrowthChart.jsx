import { useMemo, useRef, useState } from 'react';

const getGross = (snapshot) => {
  const value = snapshot.total_gross
    ?? snapshot.totalGross
    ?? snapshot.booked_gross
    ?? snapshot.bookedGross;
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'string'
    ? Number(value.replace(/[^0-9.-]/g, ''))
    : Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatRupee = (value) => {
  const absoluteValue = Math.abs(value);
  const sign = value < 0 ? '- ' : '';
  if (absoluteValue >= 1e7) return `${sign}₹${(absoluteValue / 1e7).toFixed(1)} Cr`;
  if (absoluteValue >= 1e5) return `${sign}₹${(absoluteValue / 1e5).toFixed(1)} L`;
  if (absoluteValue >= 1e3) return `${sign}₹${(absoluteValue / 1e3).toFixed(0)} K`;
  return `${sign}₹${absoluteValue.toLocaleString('en-IN')}`;
};

const formatTimestamp = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || 'Unknown time');
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).replace(/\s(am|pm)/i, (match) => match.toUpperCase());
};

export const IndiaGrossGrowthChart = ({ historyData = [] }) => {
  const svgRef = useRef(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const chart = useMemo(() => {
    const snapshots = historyData
      .filter((snapshot) => snapshot && typeof snapshot === 'object' && snapshot.timestamp)
      .map((snapshot) => ({
        timestamp: snapshot.timestamp,
        time: new Date(snapshot.timestamp).getTime(),
        gross: getGross(snapshot)
      }))
      .filter((snapshot) => Number.isFinite(snapshot.time) && snapshot.gross !== null)
      .sort((a, b) => a.time - b.time);

    if (snapshots.length < 2) return null;

    const points = snapshots.map((snapshot, index) => {
      const previousGross = index > 0 ? snapshots[index - 1].gross : null;
      return {
        ...snapshot,
        previousGross,
        changeFromPrevious: previousGross === null ? null : snapshot.gross - previousGross
      };
    });
    const maximumGross = Math.max(0, ...points.map((point) => point.gross));

    return {
      points,
      minimum: 0,
      maximum: maximumGross > 0 ? maximumGross * 1.08 : 1
    };
  }, [historyData]);

  if (!chart) return null;

  const width = 1000;
  const height = 350;
  const paddingLeft = 100;
  const paddingRight = 32;
  const paddingTop = 36;
  const paddingBottom = 66;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const getX = (index) => chart.points.length === 1
    ? paddingLeft + plotWidth / 2
    : paddingLeft + (index / (chart.points.length - 1)) * plotWidth;
  const getY = (value) => height - paddingBottom
    - ((value - chart.minimum) / (chart.maximum - chart.minimum)) * plotHeight;
  const linePoints = chart.points
    .map((point, index) => `${getX(index)},${getY(point.gross)}`)
    .join(' ');
  const labelCount = Math.min(5, chart.points.length);
  const labelIndices = [...new Set(Array.from({ length: labelCount }, (_, index) =>
    labelCount === 1
      ? 0
      : Math.round((index / (labelCount - 1)) * (chart.points.length - 1))
  ))];
  const hoveredPoint = hoveredIndex === null ? null : chart.points[hoveredIndex];

  const handleMouseMove = (event) => {
    if (!svgRef.current || !chart.points.length) return;
    if (chart.points.length === 1) {
      setHoveredIndex(0);
      return;
    }
    const bounds = svgRef.current.getBoundingClientRect();
    if (!bounds.width) return;
    const chartX = ((event.clientX - bounds.left) / bounds.width) * width;
    const pointIndex = Math.round(((chartX - paddingLeft) / plotWidth) * (chart.points.length - 1));
    setHoveredIndex(Math.max(0, Math.min(chart.points.length - 1, pointIndex)));
  };

  return (
    <div className="summary-section india-gross-growth-chart" style={{ marginTop: '20px', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '14px' }}>
        <h2 style={{ margin: 0 }}>Total Gross Over Time</h2>
        <span style={{ color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap' }}>
          {chart.points.length.toLocaleString()} runs
        </span>
      </div>

      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Total gross across all history snapshots"
          style={{ width: '100%', height: 'auto', background: 'transparent' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const value = chart.minimum + ratio * (chart.maximum - chart.minimum);
            const y = getY(value);
            return (
              <g key={ratio}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke={ratio === 0 ? '#64748b' : '#334155'}
                  strokeDasharray="5 5"
                  strokeWidth={1}
                />
                <text x={paddingLeft - 12} y={y + 5} fill="#A0A0B4" fontSize={13} textAnchor="end">
                  {formatRupee(value)}
                </text>
              </g>
            );
          })}

          {labelIndices.map((index) => {
            const anchor = index === 0 ? 'start' : index === chart.points.length - 1 ? 'end' : 'middle';
            return (
              <text
                key={index}
                x={getX(index)}
                y={height - paddingBottom + 28}
                fill="#A0A0B4"
                fontSize={12}
                textAnchor={anchor}
              >
                {formatTimestamp(chart.points[index].timestamp)}
              </text>
            );
          })}

          {chart.points.length > 1 && (
            <polyline
              points={linePoints}
              fill="none"
              stroke="#4ade80"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {hoveredPoint && (
            <line
              x1={getX(hoveredIndex)}
              y1={paddingTop}
              x2={getX(hoveredIndex)}
              y2={height - paddingBottom}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
          )}

          {chart.points.map((point, index) => (
            <circle
              key={`${point.time}-${index}`}
              cx={getX(index)}
              cy={getY(point.gross)}
              r={chart.points.length > 80 ? 2 : 3.5}
              fill="#4ade80"
              stroke={index === hoveredIndex ? '#f8fafc' : 'none'}
              strokeWidth={index === hoveredIndex ? 2 : 0}
            >
              <title>{`${formatTimestamp(point.timestamp)}: total gross ${formatRupee(point.gross)}; growth since previous ${point.changeFromPrevious === null ? 'not available' : formatRupee(point.changeFromPrevious)}`}</title>
            </circle>
          ))}
        </svg>

        {hoveredPoint && (
          <div style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            backgroundColor: 'rgba(30, 41, 59, 0.9)',
            backdropFilter: 'blur(8px)',
            padding: '12px 14px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '8px',
            color: 'var(--text-main)',
            fontSize: '12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
            zIndex: 10,
            pointerEvents: 'none'
          }}>
            <div className="pacing-tooltip-title" style={{ fontWeight: 700, borderBottom: '1px solid #334155', paddingBottom: '6px', marginBottom: '7px' }}>
              {formatTimestamp(hoveredPoint.timestamp)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', margin: '4px 0' }}>
              <span>Total Gross:</span>
              <strong>{formatRupee(hoveredPoint.gross)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', margin: '4px 0' }}>
              <span style={{ color: hoveredPoint.changeFromPrevious === null || hoveredPoint.changeFromPrevious >= 0 ? '#4ade80' : '#f87171' }}>
                Growth Since Previous:
              </span>
              <strong>
                {hoveredPoint.changeFromPrevious === null ? 'No previous run' : formatRupee(hoveredPoint.changeFromPrevious)}
              </strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};