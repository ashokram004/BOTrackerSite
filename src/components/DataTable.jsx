import { memo, useMemo, useState } from 'react';

const formatCurrency = (val, currency = 'USD') => {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(Number(val));
};

const formatNumber = (val) => Number(val).toLocaleString();

const formatDeltaValue = (val, currency = 'USD') => {
  if (val === 0) return '';
  const sign = val > 0 ? '+' : '-';
  return `${sign} ${formatCurrency(Math.abs(val), currency)}`;
};

const getOccupancyColor = (occ) => {
  if (occ >= 60) return "#4ade80";
  if (occ >= 50) return "#fb923c";
  if (occ >= 30) return "#facc15";
  return "#f87171";
};

const removeTheaterCityPrefix = (value) => String(value || '').replace(/^\s*\([^)]*\)\s*/, '');

export const DataTable = memo(({
  title,
  data = [],
  isFormat,
  isLanguage,
  isState,
  isTheater,
  showGrowth = true,
  currency = 'USD',
  totalCount = data.length,
  hasMore = false,
  loadingMore = false,
  onLoadMore
}) => {
  const [visibleLimit, setVisibleLimit] = useState(20);
  const rowLimit = 20;

  const visibleRows = useMemo(() => data.slice(0, visibleLimit), [data, visibleLimit]);
  const canShowMore = visibleRows.length < data.length || hasMore;

  return (
    <div className={`summary-section us-summary-table${showGrowth ? '' : ' us-summary-table--without-growth'}`}>
      <h2>{title}</h2>
      <div className="table-scroll table-scroll-us" style={{ overflowX: 'auto', width: '100%' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Shows</th>
              <th>Tickets</th>
              <th>Gross</th>
              <th>Occ</th>
              {showGrowth && <th>Growth</th>}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => {
              const dGross = row.d_gross ?? 0;
              const growthColor = dGross > 0 ? '#4ade80' : dGross < 0 ? '#f87171' : '#94a3b8';
              
              let nameClass = "";
              if (isFormat) nameClass = "format-col";
              if (isLanguage) nameClass = "language-col";
              if (isState) nameClass = "state-col";
              if (isTheater) nameClass = "theater-col";

              return (
                <tr key={i}>
                  <td className={nameClass}>
                    {isTheater ? removeTheaterCityPrefix(row.name) : row.name}
                  </td>
                  <td>{formatNumber(row.shows)}</td>
                  <td>{formatNumber(row.booked)}</td>
                  <td className="gross-val" style={{ textAlign: 'right' }}>{formatCurrency(row.gross, currency)}</td>
                  <td style={{ color: getOccupancyColor(row.occ) }}>
                    {Number(row.occ).toFixed(1)}%
                  </td>
                  {showGrowth && (
                    <td style={{ color: growthColor }}>
                      {formatDeltaValue(dGross, currency)}
                    </td>
                  )}
                </tr>
              );
            })}
            
            {!visibleRows.length && (
              <tr>
                <td
                  colSpan={showGrowth ? 6 : 5}
                  style={{
                    textAlign: 'center',
                    padding: '18px',
                    color: 'var(--text-muted)'
                  }}
                >
                  No data available.
                </td>
              </tr>
            )}

            {canShowMore && (

              <tr>

                <td colSpan={showGrowth ? 6 : 5} style={{ textAlign: 'center', padding: '18px', borderBottom: 'none' }}>
                  <button
                    onClick={() => {
                      if (visibleRows.length >= data.length && hasMore) onLoadMore?.();
                      setVisibleLimit((previous) => previous + rowLimit);
                    }}
                    disabled={loadingMore}
                    className="toggle-btn"
                    style={{ width: 'auto', padding: '10px 18px' }}
                  >
                    {loadingMore
                      ? 'Loading...'
                      : `Load More (${Math.max(0, totalCount - visibleRows.length)} remaining)`}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
