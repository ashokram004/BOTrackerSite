import { memo, useMemo, useState } from 'react';

const formatCurrency = (val) => {
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatNumber = (val) => Number(val).toLocaleString();

const removeTheaterCityPrefix = (value) => String(value || '').replace(/^\s*\([^)]*\)\s*/, '');

export const DifferenceTable = memo(({
  title,
  data = [],
  type,
  totalCount = data.length,
  hasMore = false,
  loadingMore = false,
  disabled = false,
  onLoadMore
}) => {
  const [visibleLimit, setVisibleLimit] = useState(20);
  const rowLimit = 20;

  const visibleRows = useMemo(() => {
    if (!data) return [];
    return data.slice(0, visibleLimit);
  }, [data, visibleLimit]);
  const canShowMore = visibleRows.length < data.length || hasMore;

  // type can be 'added', 'removed', 'booked', 'cancelled'
  const isShowChange = type === 'added' || type === 'removed';
  const isTicketChange = type === 'booked' || type === 'cancelled';

  return (
    <div className="summary-section">
      <h2>{title}</h2>
      <div className="table-scroll table-scroll-difference" style={{ overflowX: 'auto', width: '100%' }}>
        <table>
          <thead>
            <tr>
              <th>Theater</th>
              <th>Show Time</th>
              <th>Format</th>
              <th>Language</th>
              {isShowChange && <th>Tickets</th>}
              {isShowChange && <th>Gross</th>}
              {isTicketChange && <th>{type === 'booked' ? 'Tickets Added' : 'Tickets Cancelled'}</th>}
              {isTicketChange && <th>{type === 'booked' ? 'Gross Increase' : 'Gross Decrease'}</th>}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => {
              const changeColor = type === 'booked' ? '#4ade80' : '#f87171';
              const changeSign = type === 'booked' ? '+' : '-';

              return (
                <tr key={row.id || i}>
                  <td className="theater-col">{removeTheaterCityPrefix(row.theater || row['Theater Name'])}</td>
                  <td>{row.time || row['Show Time']}</td>
                  <td>{row.format || row['Format']}</td>
                  <td>{row.language || row['Language']}</td>
                  
                  {/* Columns for Added/Removed Shows */}
                  {isShowChange && (
                    <td>
                      {formatNumber(row.booked !== undefined ? row.booked : row['Booked'])}
                    </td>
                  )}
                  {isShowChange && <td className="gross-val" style={{ textAlign: 'right' }}>{formatCurrency(row.gross !== undefined ? row.gross : row['Gross ($)'])}</td>}
                  
                  {/* Columns for Ticket Variations (Tickets & Gross Deltas) */}
                  {isTicketChange && (
                    <>
                      <td style={{ color: changeColor, fontWeight: 'bold' }}>
                        {changeSign}{formatNumber(row.diffBooked)}
                      </td>
                      <td style={{ color: changeColor, fontWeight: 'bold', textAlign: 'right' }}>
                        {changeSign}{formatCurrency(row.diffGross)}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            
            {/* Empty State Row */}
            {!visibleRows.length && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    textAlign: 'center',
                    padding: '18px',
                    color: 'var(--text-muted)'
                  }}
                >
                  No records found.
                </td>
              </tr>
            )}

            {/* Pagination/Toggle Row */}
            {canShowMore && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '18px', borderBottom: 'none' }}>
                  <button
                    onClick={() => {
                      if (visibleRows.length >= data.length && hasMore) onLoadMore?.();
                      setVisibleLimit((previous) => previous + rowLimit);
                    }}
                    disabled={disabled || loadingMore}
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