

const formatCurrency = (val) => {
  if (!Number.isFinite(Number(val))) return '$0';

  return `$${Number(val).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
};

const formatDelta = (val, isCurrency = false) => {
  if (val === 0) return { text: '', class: 'delta-neutral' };
  const sign = val > 0 ? '+' : '-';
  const num = isCurrency
    ? formatCurrency(Math.abs(val))
    : Math.abs(val).toLocaleString();
  return {
    text: `${sign}${num}`,
    class: val > 0 ? 'delta-positive' : 'delta-negative'
  };
};

const getOccupancyColor = (occ) => {
  if (occ >= 60) return '#4ade80';
  if (occ >= 50) return '#fb923c';
  if (occ >= 30) return '#facc15';
  return '#f87171';
};

export const KPIGrid = ({ kpis }) => {
  if (!kpis) return null;

  const dGross = formatDelta(kpis.totalGross.delta, true);
  const dTickets = formatDelta(kpis.totalBooked.delta);
  const dVenues = formatDelta(kpis.totalVenues.delta);
  const dShows = formatDelta(kpis.totalShows.delta);

  const avgTicketPrice =
    kpis.totalBooked.val > 0
      ? kpis.totalGross.val / kpis.totalBooked.val
      : 0;

  return (
    <div className="kpi-grid">
      <div className="kpi-card">
        <div className="kpi-title">Total Gross</div>
        <div className="kpi-value">{formatCurrency(kpis.totalGross.val)}</div>
        <div className={`kpi-sub ${dGross.class}`} style={{ color: '#4ade80' }}>{dGross.text}</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Tickets Sold</div>
        <div className="kpi-value">{kpis.totalBooked.val.toLocaleString()}</div>
        <div className={`kpi-sub ${dTickets.class}`} style={{ color: '#4ade80' }}>{dTickets.text}</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Total Venues</div>
        <div className="kpi-value">{kpis.totalVenues.val.toLocaleString()}</div>
        <div className={`kpi-sub ${dVenues.class}`} style={{ color: '#4ade80' }}>{dVenues.text}</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Total Shows</div>
        <div className="kpi-value">{kpis.totalShows.val.toLocaleString()}</div>
        <div className={`kpi-sub ${dShows.class}`} style={{ color: '#4ade80' }}>{dShows.text}</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Overall Occupancy</div>
        <div
          className="kpi-value"
          style={{ color: getOccupancyColor(kpis.occupancy.val) }}
        >
          {kpis.occupancy.val.toFixed(1)}%
        </div>
        <div className={`kpi-sub ${dShows.class}`}>-</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Avg Ticket Price</div>
        <div className="kpi-value">${avgTicketPrice.toFixed(0)}</div>
        <div className={`kpi-sub ${dShows.class}`}>-</div>
      </div>
    </div>
  );
};
