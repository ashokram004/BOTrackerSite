import { useMemo, useState } from 'react';
import { DashboardHeader } from './DashboardHeader';

const formatRupee = (value) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '₹0';
  return `₹${n.toLocaleString('en-IN')}`;
};

const formatNumber = (value) => Number(value || 0).toLocaleString('en-IN');

const getOccupancyColor = (occ = 0) => {
  if (occ >= 80) return '#4ade80';
  if (occ >= 50) return '#facc15';
  if (occ >= 30) return '#fb923c';
  return '#f87171';
};

const getTimeCategory = (timeValue) => {
  const raw = String(timeValue || '').trim();
  if (!raw || raw === 'Unknown') return '7. Unknown Time';

  const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return '7. Unknown Time';

  let hour = Number(match[1]);
  const ampm = (match[3] || '').toLowerCase();
  if (ampm === 'pm' && hour !== 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;

  if (hour >= 5 && hour < 9) return 'Early Morning (5am-9am)';
  if (hour >= 9 && hour < 12) return 'Morning (9am-12pm)';
  if (hour >= 12 && hour < 16) return 'Afternoon (12pm-4pm)';
  if (hour >= 16 && hour < 20) return 'Evening (4pm-8pm)';
  if (hour >= 20 && hour < 24) return 'Night (8pm-12am)';
  return 'Midnight (12am-5am)';
};

const getOccTier = (occ = 0) => {
  if (occ >= 100) return 'Sold Out';
  if (occ >= 80) return 'Almost Full';
  if (occ >= 50) return 'Fast Filling';
  return 'Available';
};

const getBadgeClass = (tier = 'Available') => {
  if (tier === 'Sold Out') return 'b-soldout';
  if (tier === 'Almost Full') return 'b-almost';
  if (tier === 'Fast Filling') return 'b-fast';
  return 'b-avail';
};

const SOURCE_META = {
  BookMyShow: { tone: 'platform-bms', color: '#f43f5e', label: 'BookMyShow Exclusive' },
  District: { tone: 'platform-dist', color: '#9844DE', label: 'District Exclusive' },
  Merged: { tone: 'platform-merge', color: '#f59e0b', label: 'Merged Shows' }
};

const getSourceClass = (source = 'Unknown') => {
  if (source === 'Merged') return 'src-merge';
  if (source === 'BookMyShow') return 'src-bms';
  return 'src-dist';
};

const buildGroupSummary = (rows, field, includeGeo = false) => {
  const map = {};

  rows.forEach((row) => {
    const rawKey = String(row[field] || 'Unknown');
    if (!rawKey || rawKey === 'Unknown' || rawKey.toLowerCase().includes('unknown')) return;

    const key = rawKey;
    if (!map[key]) {
      map[key] = {
        name: key,
        shows: 0,
        total: 0,
        booked: 0,
        gross: 0,
        venueSet: new Set(),
        state: row.state || 'Unknown',
        city: row.city || 'Unknown'
      };
    }

    map[key].shows += 1;
    map[key].total += Number(row.total || 0);
    map[key].booked += Number(row.booked || 0);
    map[key].gross += Number(row.gross || 0);
    map[key].venueSet.add(`${row.theater || 'Unknown'}-${row.city || 'Unknown'}`);
  });

  return Object.values(map)
    .map((item) => ({
      ...item,
      venues: item.venueSet.size,
      occupancy: item.total > 0 ? (item.booked / item.total) * 100 : 0,
      ...(includeGeo ? { state: item.state, city: item.city } : {})
    }))
    .sort((a, b) => b.gross - a.gross);
};

export const IndiaMovieDashboard = ({ rows = [], movieName = 'Movie', showDate = 'N/A', onBack, onChangeMovie, onHome, onReload, lastUpdated = 'N/A' }) => {
  const [filters, setFilters] = useState({
    state: 'ALL',
    city: 'ALL',
    theater: 'ALL',
    format: 'ALL',
    language: 'ALL',
    timeCat: 'ALL',
    occTier: 'ALL'
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showAllStates, setShowAllStates] = useState(false);
  const [showAllCities, setShowAllCities] = useState(false);
  const [showAllTheatres, setShowAllTheatres] = useState(false);

  const usableRows = useMemo(
    () => rows.filter((row) => row && row.sourceType && String(row.sourceType).toLowerCase() !== 'unknown'),
    [rows]
  );

  const uniqueStates = useMemo(() => [...new Set(usableRows.filter((r) => (r.state || 'Unknown') !== 'Unknown').map((r) => r.state || 'Unknown'))].sort(), [usableRows]);
  const uniqueFormats = useMemo(() => [...new Set(usableRows.filter((r) => (r.format || 'Unknown') !== 'Unknown').map((r) => r.format || 'Unknown'))].sort(), [usableRows]);
  const uniqueLanguages = useMemo(() => [...new Set(usableRows.filter((r) => (r.language || 'Unknown') !== 'Unknown').map((r) => r.language || 'Unknown'))].sort(), [usableRows]);
  const uniqueTimeCats = useMemo(() => [...new Set(usableRows.map((r) => getTimeCategory(r.time || 'Unknown')).filter((value) => value && !value.toLowerCase().includes('unknown')))].sort(), [usableRows]);

  const filteredCities = useMemo(() => {
    let collection = usableRows;
    if (filters.state !== 'ALL') collection = collection.filter((r) => r.state === filters.state);
    return [...new Set(collection.map((r) => r.city || 'Unknown'))].sort();
  }, [filters.state, usableRows]);

  const filteredTheaters = useMemo(() => {
    let collection = usableRows;
    if (filters.state !== 'ALL') collection = collection.filter((r) => r.state === filters.state);
    if (filters.city !== 'ALL') collection = collection.filter((r) => r.city === filters.city);
    return [...new Set(collection.map((r) => r.theater || 'Unknown'))].sort();
  }, [filters.city, filters.state, usableRows]);

  const filteredRows = useMemo(() => {
    return usableRows.filter((row) => {
      if (filters.state !== 'ALL' && row.state !== filters.state) return false;
      if (filters.city !== 'ALL' && row.city !== filters.city) return false;
      if (filters.theater !== 'ALL' && row.theater !== filters.theater) return false;
      if (filters.format !== 'ALL' && row.format !== filters.format) return false;
      if (filters.language !== 'ALL' && row.language !== filters.language) return false;
      if (filters.timeCat !== 'ALL' && getTimeCategory(row.time) !== filters.timeCat) return false;
      if (filters.occTier !== 'ALL' && getOccTier(row.occ) !== filters.occTier) return false;
      return true;
    });
  }, [filters, usableRows]);

  const totalGross = filteredRows.reduce((sum, row) => sum + Number(row.gross || 0), 0);
  const totalBooked = filteredRows.reduce((sum, row) => sum + Number(row.booked || 0), 0);
  const totalTickets = filteredRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const totalVenues = new Set(filteredRows.map((row) => `${row.theater || 'Unknown'}-${row.city || 'Unknown'}`)).size;
  const occupancy = totalTickets > 0 ? (totalBooked / totalTickets) * 100 : 0;

  const stateSummary = buildGroupSummary(filteredRows, 'state');
  const citySummary = buildGroupSummary(filteredRows, 'city');
  const formatSummary = buildGroupSummary(filteredRows, 'format');
  const languageSummary = buildGroupSummary(filteredRows, 'language');
  const timeSummary = buildGroupSummary(filteredRows, 'timeCat');
  const occTierSummary = buildGroupSummary(
    filteredRows.map((row) => ({ ...row, timeCat: getOccTier(row.occ) })),
    'timeCat'
  );
  const theatreSummary = buildGroupSummary(filteredRows, 'theater', true);

  const sourceBuckets = ['BookMyShow', 'District', 'Merged'].map((label) => {
    const total = filteredRows.reduce((sum, row) => {
      if ((row.sourceType || 'Unknown') === label) return sum + Number(row.gross || 0);
      return sum;
    }, 0);
    const shows = filteredRows.reduce((sum, row) => {
      if ((row.sourceType || 'Unknown') === label) return sum + 1;
      return sum;
    }, 0);

    return {
      label,
      value: total,
      shows,
      meta: SOURCE_META[label] || SOURCE_META.Merged
    };
  });

  const summaryCards = [
    { label: 'Total Gross', value: formatRupee(totalGross) },
    { label: 'Tickets Sold', value: formatNumber(totalBooked) },
    { label: 'Total Shows', value: formatNumber(filteredRows.length) },
    { label: 'Total Venues', value: formatNumber(totalVenues) },
    { label: 'Overall Occupancy', value: `${Number(occupancy).toFixed(1)}%` }
  ];

  const renderSummaryCard = (title, value) => (
    <div key={title} className="kpi-card">
      <div className="kpi-title">{title}</div>
      <div className="kpi-value" style={{ fontSize: '32px' }}>{value}</div>
    </div>
  );

  const renderTable = (title, data) => (
    <div className="summary-section" key={title}>
      <h2>{title}</h2>
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Shows</th>
              <th>Tickets</th>
              <th>Gross</th>
              <th>Occ %</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((row, idx) => (
              <tr key={`${title}-${row.name || idx}`}>
                <td>{row.name || 'Unknown'}</td>
                <td>{formatNumber(row.shows || 0)}</td>
                <td>{formatNumber(row.booked || 0)}</td>
                <td className="gross-val">{formatRupee(row.gross || 0)}</td>
                <td style={{ color: getOccupancyColor(row.occupancy || 0) }}>{Number(row.occupancy || 0).toFixed(1)}%</td>
              </tr>
            ))}
            {!data?.length && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '18px', color: 'var(--text-muted)' }}>
                  No data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div id="app">
      <div className="container">
        <DashboardHeader
          marketLabel="India Box Office Tracking"
          movieName={movieName}
          showDate={showDate}
          lastUpdated={lastUpdated}
          leftActions={[
            { label: 'Home', onClick: onHome, variant: 'secondary' },
            { label: 'Change Movie', onClick: onChangeMovie, variant: 'secondary' },
            { label: 'Change Date', onClick: onBack, variant: 'secondary' },
            { label: 'Reload Data', onClick: onReload, variant: 'secondary' }
          ]}
          rightActions={[
            { label: showFilters ? 'Hide Filters' : 'Show Filters', onClick: () => setShowFilters((v) => !v), variant: 'primary' }
          ]}
        />

        {showFilters && (
          <div className="filter-panel">
            <div className="filter-grid">
              <div>
                <div className="filter-label">State</div>
                <select className="filter-select" value={filters.state} onChange={(e) => setFilters((prev) => ({ ...prev, state: e.target.value, city: 'ALL', theater: 'ALL' }))}>
                  <option value="ALL">All States</option>
                  {uniqueStates.map((state) => <option key={state} value={state}>{state}</option>)}
                </select>
              </div>
              <div>
                <div className="filter-label">City</div>
                <select className="filter-select" value={filters.city} onChange={(e) => setFilters((prev) => ({ ...prev, city: e.target.value, theater: 'ALL' }))}>
                  <option value="ALL">All Cities</option>
                  {filteredCities.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
              </div>
              <div>
                <div className="filter-label">Theatre</div>
                <select className="filter-select" value={filters.theater} onChange={(e) => setFilters((prev) => ({ ...prev, theater: e.target.value }))}>
                  <option value="ALL">All Theatres</option>
                  {filteredTheaters.map((theater) => <option key={theater} value={theater}>{theater}</option>)}
                </select>
              </div>
              <div>
                <div className="filter-label">Language</div>
                <select className="filter-select" value={filters.language} onChange={(e) => setFilters((prev) => ({ ...prev, language: e.target.value }))}>
                  <option value="ALL">All Languages</option>
                  {uniqueLanguages.map((language) => <option key={language} value={language}>{language}</option>)}
                </select>
              </div>
              <div>
                <div className="filter-label">Format</div>
                <select className="filter-select" value={filters.format} onChange={(e) => setFilters((prev) => ({ ...prev, format: e.target.value }))}>
                  <option value="ALL">All Formats</option>
                  {uniqueFormats.map((format) => <option key={format} value={format}>{format}</option>)}
                </select>
              </div>
              <div>
                <div className="filter-label">Time of Day</div>
                <select className="filter-select" value={filters.timeCat} onChange={(e) => setFilters((prev) => ({ ...prev, timeCat: e.target.value }))}>
                  <option value="ALL">All Times</option>
                  {uniqueTimeCats.map((time) => <option key={time} value={time}>{time}</option>)}
                </select>
              </div>
              <div>
                <div className="filter-label">Occupancy Tier</div>
                <select className="filter-select" value={filters.occTier} onChange={(e) => setFilters((prev) => ({ ...prev, occTier: e.target.value }))}>
                  <option value="ALL">All Tiers</option>
                  <option value="Sold Out">Sold Out (100%)</option>
                  <option value="Almost Full">Almost Full (80-99%)</option>
                  <option value="Fast Filling">Fast Filling (50-79%)</option>
                  <option value="Available">Available (0-49%)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="kpi-grid">
          {summaryCards.map((card) => renderSummaryCard(card.label, card.value))}
        </div>

        <div className="platform-grid">
          {sourceBuckets.map((bucket) => {
            const meta = bucket.meta || SOURCE_META[bucket.label] || SOURCE_META.Merged;
            return (
              <div key={bucket.label} className={`kpi-card ${meta.tone}`}>
                <div className="kpi-title" style={{ color: meta.color }}>
                  {meta.label}
                </div>
                <div className="platform-val-row">
                  <div className="kpi-value">{formatRupee(bucket.value)}</div>
                  <div className="platform-tkts">{formatNumber(bucket.shows)} shows</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="dashboard-row">
          {renderTable('Format Distribution', formatSummary)}
          {renderTable('Language Distribution', languageSummary)}
        </div>

        <div className="dashboard-row">
          {renderTable('State Breakdown', stateSummary)}
          {renderTable('Top Cities', citySummary)}
        </div>

        <div className="dashboard-row">
          {renderTable('Time of Day Analysis', timeSummary)}
          {renderTable('Demand Tiers', occTierSummary)}
        </div>

        <div className="summary-section" style={{ marginBottom: '20px' }}>
          <h2>Top Grossing Theatres</h2>
          <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>State</th>
                  <th>City</th>
                  <th>Theatre Name</th>
                  <th>Shows</th>
                  <th>Tickets</th>
                  <th>Gross</th>
                  <th>Occ %</th>
                </tr>
              </thead>
              <tbody>
                {(showAllTheatres ? theatreSummary : theatreSummary.slice(0, 25)).map((row) => (
                  <tr key={`${row.name}-${row.city}`}>
                    <td style={{ color: '#94a3b8', fontSize: '11px' }}>{row.state}</td>
                    <td style={{ color: '#94a3b8', fontSize: '11px' }}>{row.city}</td>
                    <td className="theater-col">{row.name}</td>
                    <td>{formatNumber(row.shows || 0)}</td>
                    <td>{formatNumber(row.booked || 0)}</td>
                    <td className="gross-val">{formatRupee(row.gross || 0)}</td>
                    <td style={{ color: getOccupancyColor(row.occupancy || 0) }}>{Number(row.occupancy || 0).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {theatreSummary.length > 25 && (
            <div style={{ textAlign: 'center', paddingTop: '15px' }}>
              <button onClick={() => setShowAllTheatres((v) => !v)} className="toggle-btn" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)' }}>
                {showAllTheatres ? 'Hide Full List' : 'Load All Theatres'}
              </button>
            </div>
          )}
        </div>

        <div className="summary-section" style={{ marginBottom: '0' }}>
          <h2>Master Ledger <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>(Reacts to Filters)</span></h2>
          <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>City</th>
                  <th>Theatre Name</th>
                  <th>Lang/Fmt</th>
                  <th>Time</th>
                  <th>Tier</th>
                  <th>Tickets</th>
                  <th>Gross</th>
                  <th>Occ %</th>
                </tr>
              </thead>
              <tbody>
                {[...(filteredRows || [])].sort((a, b) => Number(b.gross || 0) - Number(a.gross || 0)).map((row, idx) => (
                  <tr key={`${row.id || idx}`}>
                    <td className={getSourceClass(row.sourceType)}>{row.sourceType || 'Unknown'}</td>
                    <td style={{ color: '#94a3b8', fontSize: '11px' }}>{row.city}</td>
                    <td className="theater-col">{row.theater}</td>
                    <td style={{ color: '#94a3b8', fontSize: '11px' }}>{row.language} / {row.format}</td>
                    <td>{row.time}</td>
                    <td><span className={`badge ${getBadgeClass(getOccTier(row.occ))}`}>{getOccTier(row.occ)}</span></td>
                    <td>{formatNumber(row.booked || 0)} <span style={{ color: '#64748b', fontSize: '10px' }}> / {formatNumber(row.total || 0)}</span></td>
                    <td className="gross-val">{formatRupee(row.gross || 0)}</td>
                    <td style={{ color: getOccupancyColor(row.occ || 0) }}>{Number(row.occ || 0).toFixed(1)}%</td>
                  </tr>
                ))}
                {!filteredRows.length && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '18px', color: 'var(--text-muted)' }}>No rows match the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="footer">Wknd Cinema • BMS + District Analytics • Generated {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</div>
      </div>
    </div>
  );
};
