import { useMemo, useState } from 'react';

const formatCurrency = (val) => {
  if (!Number.isFinite(Number(val))) return '$0';
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const statusClass = (status) => {
  const s = String(status || '').toLowerCase();
  if (s.includes('sold')) return 'status-badge status-sold-out';
  return 'status-badge status-available';
};

const getOccupancyColor = (occ) => {
  if (occ >= 60) return '#4ade80';
  if (occ >= 50) return '#fb923c';
  if (occ >= 30) return '#facc15';
  return '#f87171';
};

export const ShowsTable = ({ rows }) => {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const onSortKey = (key) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(null); setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    const copy = [...(rows || [])];
    if (!sortKey) return copy;
    copy.sort((a, b) => {
      const av = a?.[sortKey];
      const bv = b?.[sortKey];
      const dir = sortDir === 'desc' ? -1 : 1;

      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const th = (key, label, align = 'left') => (
    <th
      onClick={() => onSortKey?.(key)}
      style={{ cursor: 'pointer', textAlign: align }}
    >
      {label} {sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div className="summary-section">
      <h2>
        All Showtimes
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {(sorted.length-1).toLocaleString()} shows | Click on any column heading to sort
        </span>
      </h2>

      <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
        <table>
          <thead>
            <tr>
              {th('state', 'St', 'left')}
              {th('format', 'Format', 'left')}
              {th('language', 'Language', 'left')}
              {th('theater', 'Theatre', 'left')}
              {th('time', 'Time', 'left')}
              {th('timeCat', 'Time Category', 'left')}
              {th('status', 'Status', 'left')}
              {th('price_str', 'Price', 'right')}
              {th('booked', 'Tickets', 'right')}
              {th('gross', 'Gross', 'right')}
              {th('occ', 'Occ', 'right')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td className="state-col" style={{ textAlign: 'left' }}>
                  {String(r.state).slice(0, 4).toUpperCase()}
                </td>
                <td className="format-col" style={{ textAlign: 'left' }}>{r.format}</td>
                <td className="language-col" style={{ textAlign: 'left' }}>{r.language}</td>
                <td className="theater-col" style={{ textAlign: 'left' }}>{r.theater}</td>
                <td style={{ textAlign: 'left' }}>{r.time}</td>
                <td style={{ color: 'var(--text-muted)', textAlign: 'left' }}>{r.timeCat}</td>
                <td style={{ textAlign: 'left' }}>
                  <span className={statusClass(r.status)}>{r.status}</span>
                </td>
                <td style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{r.price_str}</td>
                <td style={{ textAlign: 'right' }}>{(r.booked || 0).toLocaleString()}</td>
                <td className="gross-val" style={{ textAlign: 'right' }}>{formatCurrency(r.gross || 0)}</td>
                <td style={{ color: getOccupancyColor(r.occ || 0), textAlign: 'right' }}>
                  {Number(r.occ || 0).toFixed(1)}%
                </td>
              </tr>
            ))}
            {!sorted.length && (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                  No rows match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
