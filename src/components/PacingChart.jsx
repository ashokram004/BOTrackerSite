import React, { useMemo, useRef, useState } from 'react';

// Bulletproof IST Time Extractor
const getIstTimeInfo = (utcString) => {
  const date = new Date(utcString);
  if (isNaN(date.getTime())) return null;

  const istEpoch = date.getTime() + (5.5 * 60 * 60 * 1000);
  const istDate = new Date(istEpoch);
  
  return {
    hours: istDate.getUTCHours(),
    mins: istDate.getUTCMinutes(),
    cycleDateObj: istDate
  };
};

// Strips commas and symbols and prevents NaN
const normalizeNumber = (value) => {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.-]+/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
};

// Extracts value whether it's a raw number, string, or a KPI object like { val: 1000, delta: 10 }
const extractVal = (obj) => {
  if (obj === undefined || obj === null) return 0;
  if (typeof obj === 'object' && obj.val !== undefined) return normalizeNumber(obj.val);
  return normalizeNumber(obj);
};

// Resilient Data Extractor (Focused on Gross only)
const aggregateSnapshot = (snapshot) => {
  let gross = 0;

  if (snapshot.totalGross !== undefined || snapshot.gross !== undefined || snapshot.total_gross !== undefined) {
    gross = extractVal(snapshot.totalGross || snapshot.gross || snapshot.total_gross);
  }
  else if (snapshot.kpis || snapshot.summary) {
    const kpis = snapshot.kpis || snapshot.summary;
    gross = extractVal(kpis.totalGross || kpis.gross);
  }
  else if (snapshot.data) {
    const rows = Array.isArray(snapshot.data) ? snapshot.data : Object.values(snapshot.data);
    rows.forEach(r => {
      if (r.is_extra || r.t_id === 'EXTRA') return;
      gross += normalizeNumber(r.gross !== undefined ? r.gross : (r['Gross ($)'] || r['Gross']));
    });
  }

  return { gross: gross || 0 };
};

export const PacingChart = ({ historyData }) => {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const containerRef = useRef(null);

  const paddingLeft = 80;
  const paddingRight = 40;
  const paddingTop = 40;
  const paddingBottom = 60;
  const width = 1000;
  const height = 350;

  const { buckets, maxVal } = useMemo(() => {
    if (!historyData || historyData.length === 0) return { buckets: [], maxVal: 1000 };

    const cycles = {};
    
    historyData.forEach(snap => {
      const timeInfo = getIstTimeInfo(snap.timestamp);
      if (!timeInfo) return;

      const { hours, mins, cycleDateObj } = timeInfo;
      const totalMins = hours * 60 + mins;

      // DEAD ZONE: 7:11 AM to 7:24 AM
      if (totalMins > 430 && totalMins < 445) return;

      if (totalMins <= 430) {
        cycleDateObj.setUTCDate(cycleDateObj.getUTCDate() - 1);
      }
      
      const cycleKey = cycleDateObj.toISOString().split('T')[0];
      
      if (!cycles[cycleKey]) cycles[cycleKey] = [];
      cycles[cycleKey].push({
        ...aggregateSnapshot(snap),
        totalMins,
        sortMins: totalMins <= 430 ? totalMins + 1440 : totalMins 
      });
    });

    const sortedCycleKeys = Object.keys(cycles).sort((a, b) => new Date(b) - new Date(a));
    const targetKeys = sortedCycleKeys.slice(0, 3);

    const cycleLabels = ["Today", "Yesterday", "Day Before"];
    const activeCycles = targetKeys.map((key, idx) => ({
      key,
      label: cycleLabels[idx],
      data: cycles[key].sort((a, b) => a.sortMins - b.sortMins)
    }));

    activeCycles.forEach(cycle => {
      cycle.baseline = cycle.data.length > 0 ? cycle.data[0] : { gross: 0 };
      cycle.maxSortMins = cycle.data.length > 0 ? Math.max(...cycle.data.map(d => d.sortMins)) : -1;
    });

    const buckets = [];
    let absoluteMax = 0;

    for (let m = 480; m <= 480 + (23 * 60); m += 30) {
      let currentMins = m % 1440;
      let sortMins = currentMins <= 430 ? currentMins + 1440 : currentMins;
      
      let h = Math.floor(currentMins / 60);
      let min = currentMins % 60;
      const ampm = h >= 12 ? 'PM' : 'AM';
      let displayH = h % 12 || 12;
      const timeLabel = `${displayH}:${min === 0 ? '00' : min} ${ampm}`;

      let bucketData = { time: timeLabel, sortMins };

      activeCycles.forEach(cycle => {
        if (sortMins > cycle.maxSortMins + 29) {
          bucketData[cycle.label] = null;
        } else {
          const validSnaps = cycle.data.filter(s => s.sortMins <= sortMins + 29);
          
          if (validSnaps.length > 0) {
            const latestSnap = validSnaps[validSnaps.length - 1];
            const growthGross = (latestSnap.gross || 0) - (cycle.baseline.gross || 0);
            
            const val = Math.max(0, growthGross);
            bucketData[cycle.label] = val;
            if (val > absoluteMax) absoluteMax = val;
          } else {
            bucketData[cycle.label] = null;
          }
        }
      });

      buckets.push(bucketData);
    }

    return { buckets, maxVal: absoluteMax || 1000 }; 
  }, [historyData]);

  const handleMouseMove = (e) => {
    if (!containerRef.current || buckets.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xInSvg = ((e.clientX - rect.left) / rect.width) * width;
    
    const chartWidth = width - paddingLeft - paddingRight;
    const step = chartWidth / (buckets.length - 1);
    const index = Math.round((xInSvg - paddingLeft) / step);

    if (index >= 0 && index < buckets.length) {
      setHoveredIdx(index);
    } else {
      setHoveredIdx(null);
    }
  };

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const generatePoints = (key) => {
    return buckets
      .map((b, idx) => {
        if (b[key] === null || b[key] === undefined || isNaN(b[key])) return null;
        const x = paddingLeft + (idx * (chartWidth / (buckets.length - 1)));
        const y = height - paddingBottom - (b[key] / maxVal) * chartHeight;
        return { x, y };
      })
      .filter(p => p !== null);
  };

  const pointsToday = generatePoints("Today");
  const pointsYesterday = generatePoints("Yesterday");
  const pointsDayBefore = generatePoints("Day Before");

  const createPathD = (points) => {
    if (points.length === 0) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  };

  const formatYAxis = (val) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val}`;
  };

  if (!historyData || historyData.length === 0) return null;

  const hoveredData = hoveredIdx !== null ? buckets[hoveredIdx] : null;

  return (
    <div className="summary-section" style={{ marginTop: '40px', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Gross Growth Pacing (Since last 7:30 AM IST)</h2>
      </div>

      <div style={{ position: 'relative', width: '100%' }}>
        <svg 
          ref={containerRef}
          viewBox={`0 0 ${width} ${height}`} 
          style={{ width: '100%', height: 'auto', background: 'transparent' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = height - paddingBottom - ratio * chartHeight;
            const labelVal = ratio * maxVal;
            return (
              <g key={i}>
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#334155" strokeDasharray="5 5" strokeWidth={1} />
                <text x={paddingLeft - 15} y={y + 5} fill="#A0A0B4" fontSize={14} textAnchor="end" fontFamily="sans-serif">
                  {formatYAxis(labelVal)}
                </text>
              </g>
            );
          })}

          {buckets.map((b, idx) => {
            if (idx % 4 !== 0) return null; 
            const x = paddingLeft + (idx * (chartWidth / (buckets.length - 1)));
            return (
              <text key={idx} x={x} y={height - paddingBottom + 25} fill="#A0A0B4" fontSize={13} textAnchor="middle" fontFamily="sans-serif">
                {b.time.replace(':00', '')}
              </text>
            );
          })}

          {/* Lines */}
          <path d={createPathD(pointsDayBefore)} fill="none" stroke="#64748b" strokeWidth={2} strokeDasharray="4 4" />
          <path d={createPathD(pointsYesterday)} fill="none" stroke="#f5a623" strokeWidth={2} strokeDasharray="6 4" />
          <path d={createPathD(pointsToday)} fill="none" stroke="#4ade80" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />

          {/* Hover Line */}
          {hoveredIdx !== null && (
            <line 
              x1={paddingLeft + (hoveredIdx * (chartWidth / (buckets.length - 1)))} 
              y1={paddingTop} 
              x2={paddingLeft + (hoveredIdx * (chartWidth / (buckets.length - 1)))} 
              y2={height - paddingBottom} 
              stroke="#94a3b8" 
              strokeWidth={1.5}
            />
          )}
        </svg>

        {/* Hover Tooltip */}
        {hoveredData && (
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            backgroundColor: 'rgba(30, 41, 59, 0.9)',
            backdropFilter: 'blur(8px)',
            padding: '14px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            color: '#E8E8F0',
            fontFamily: 'sans-serif',
            fontSize: '14px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
            zIndex: 10,
            pointerEvents: 'none'
          }}>
            <div style={{ fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '6px', marginBottom: '8px', color: '#FFF' }}>
              Time Slot: {hoveredData.time}
            </div>
            {hoveredData.Today !== null && hoveredData.Today !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '30px', margin: '4px 0' }}>
                <span style={{ color: '#4ade80', fontWeight: 'bold' }}>● Today:</span>
                <span style={{ fontWeight: 'bold' }}>
                  {`$${Math.round(hoveredData.Today).toLocaleString()}`}
                </span>
              </div>
            )}
            {hoveredData.Yesterday !== null && hoveredData.Yesterday !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '30px', margin: '4px 0' }}>
                <span style={{ color: '#f5a623', fontWeight: 'bold' }}>● Yesterday:</span>
                <span style={{ fontWeight: 'bold' }}>
                  {`$${Math.round(hoveredData.Yesterday).toLocaleString()}`}
                </span>
              </div>
            )}
            {hoveredData["Day Before"] !== null && hoveredData["Day Before"] !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '30px', margin: '4px 0' }}>
                <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>● Day Before:</span>
                <span style={{ fontWeight: 'bold' }}>
                  {`$${Math.round(hoveredData["Day Before"]).toLocaleString()}`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '30px', marginTop: '15px', fontFamily: 'sans-serif', fontSize: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '20px', height: '4px', backgroundColor: '#4ade80', borderRadius: '2px' }} />
          <span style={{ color: '#E8E8F0', fontWeight: 'bold' }}>Today</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '20px', height: '4px', borderTop: '3px dashed #f5a623' }} />
          <span style={{ color: '#E8E8F0', fontWeight: 'bold' }}>Yesterday</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '20px', height: '4px', borderTop: '3px dashed #64748b' }} />
          <span style={{ color: '#E8E8F0', fontWeight: 'bold' }}>Day Before</span>
        </div>
      </div>
    </div>
  );
};