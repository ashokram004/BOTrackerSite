import { useMemo, useState } from 'react';

const formatCurrency = (val) => {
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatNumber = (val) => Number(val).toLocaleString();

const formatDeltaValue = (val) => {
  if (val === 0) return '';
  const sign = val > 0 ? '+' : '-';
  return `${sign} $${Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const getOccupancyColor = (occ) => {
  if (occ >= 60) return "#4ade80";
  if (occ >= 50) return "#fb923c";
  if (occ >= 30) return "#facc15";
  return "#f87171";
};

export const DataTable = ({ title, data, isFormat, isLanguage, isState, isTheater }) => {
  const [showAll, setShowAll] = useState(false);
  const rowLimit = 20;

  const visibleRows = useMemo(() => {
    if (showAll || data.length <= rowLimit) return data;
    return data.slice(0, rowLimit);
  }, [data, showAll, rowLimit]);

  return (
    <div className="summary-section">
      <h2>{title}</h2>
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Shows</th>
              <th>Tickets</th>
              <th>Gross</th>
              <th>Occ</th>
              <th>Growth</th>
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
                    {row.name}
                  </td>
                  <td>{formatNumber(row.shows)}</td>
                  <td>{formatNumber(row.booked)}</td>
                  <td className="gross-val">{formatCurrency(row.gross)}</td>
                  <td style={{ color: getOccupancyColor(row.occ) }}>
                    {Number(row.occ).toFixed(1)}%
                  </td>
                  <td style={{ color: growthColor }}>
                    {formatDeltaValue(dGross)}
                  </td>
                </tr>
              );
            })}
            
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
                  No data available.
                </td>
              </tr>
            )}

            {data.length > rowLimit && (

              <tr>

                <td colSpan={6} style={{ textAlign: 'center', padding: '18px', borderBottom: 'none' }}>
                  <button
                    onClick={() => setShowAll((prev) => !prev)}
                    className="btn-toggle"
                    style={{ width: 'auto', padding: '10px 18px' }}
                  >
                    {showAll ? 'Hide Full List' : 'Show Full List'}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
