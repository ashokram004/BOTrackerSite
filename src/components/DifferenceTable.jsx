import { useMemo, useState } from 'react';

const formatCurrency = (val) => {
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatNumber = (val) => Number(val).toLocaleString();

export const DifferenceTable = ({ title, data, type }) => {
  const [showAll, setShowAll] = useState(false);
  const rowLimit = 20;

  const visibleRows = useMemo(() => {
    if (!data) return [];
    if (showAll || data.length <= rowLimit) return data;
    return data.slice(0, rowLimit);
  }, [data, showAll, rowLimit]);

  // type can be 'added', 'removed', 'booked', 'cancelled'
  const isShowChange = type === 'added' || type === 'removed';
  const isTicketChange = type === 'booked' || type === 'cancelled';

  return (
    <div className="summary-section">
      <h2>{title}</h2>
      <div style={{ overflowX: 'auto', width: '100%' }}>
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
                <tr key={i}>
                  <td className="theater-col">{row.theater || row['Theater Name']}</td>
                  <td>{row.time || row['Show Time']}</td>
                  <td>{row.format || row['Format']}</td>
                  <td>{row.language || row['Language']}</td>
                  
                  {/* Columns for Added/Removed Shows */}
                  {isShowChange && (
                    <td>
                      {formatNumber(row.booked !== undefined ? row.booked : row['Booked'])}
                    </td>
                  )}
                  {isShowChange && <td className="gross-val">{formatCurrency(row.gross !== undefined ? row.gross : row['Gross ($)'])}</td>}
                  
                  {/* Columns for Ticket Variations (Tickets & Gross Deltas) */}
                  {isTicketChange && (
                    <>
                      <td style={{ color: changeColor, fontWeight: 'bold' }}>
                        {changeSign}{formatNumber(row.diffBooked)}
                      </td>
                      <td style={{ color: changeColor, fontWeight: 'bold' }}>
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
            {data && data.length > rowLimit && (
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