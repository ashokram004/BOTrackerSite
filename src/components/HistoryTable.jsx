import { useMemo } from 'react';

const parseNumber = (val) => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/[^0-9.-]+/g, '');
  const num = Number(str);
  return Number.isFinite(num) ? num : 0;
};

const formatCurrency = (val) => {
  const n = parseNumber(val);
  if (n === 0) return '$0';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const getOccupancyColor = (occ) => {
  const n = parseNumber(occ);
  if (n >= 60) return '#4ade80';
  if (n >= 50) return '#fb923c';
  if (n >= 30) return '#facc15';
  return '#f87171';
};

const formatToIst = (timestamp) => {
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return String(timestamp);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).replace(/am|pm/i, match => match.toUpperCase()) + ' IST';
  } catch {
    return String(timestamp);
  }
};

export const HistoryTable = ({ data }) => {
  const sorted = useMemo(() => {
    return [...(data || [])].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [data]);

  return (
    <div className="summary-section" style={{ marginTop: '20px' }}>
      <h2>
        Historical Tracking
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {sorted.length.toLocaleString()} snapshots
        </span>
      </h2>

      <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Timestamp</th>
              <th>Gross</th>
              <th>Tickets</th>
              <th>Venues</th>
              <th>Shows</th>
              <th>Occupancy</th>
              <th>Growth</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  {formatToIst(r.timestamp)}
                </td>
                <td className="gross-val">{formatCurrency(r.total_gross ?? r.totalGross ?? 0)}</td>
                <td>{parseNumber(r.booked_tickets ?? r.bookedTickets ?? 0).toLocaleString()}</td>
                <td>{parseNumber(r.venues ?? 0).toLocaleString()}</td>
                <td>{parseNumber(r.shows ?? 0).toLocaleString()}</td>
                <td style={{ color: getOccupancyColor(r.occupancy ?? 0) }}>
                  {parseNumber(r.occupancy ?? 0).toFixed(1)}%
                </td>
                <td style={{ color: parseNumber(r.growth ?? 0) > 0 ? '#4ade80' : parseNumber(r.growth ?? 0) < 0 ? '#f87171' : 'inherit', fontWeight: 'bold' }}>
                  {parseNumber(r.growth ?? 0) > 0 ? '+' : ''}{formatCurrency(r.growth ?? 0)}
                </td>
              </tr>
            ))}
            {!sorted.length && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                  No historical data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
