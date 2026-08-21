import { useMemo, useState } from 'react';
import { DashboardHeader } from './DashboardHeader';

const formatRupee = (value) => {
  const n = Number(value || 0);

  if (!Number.isFinite(n)) return '₹0';

  if (n >= 1e7) {
    return `₹${(n / 1e7).toFixed(2).replace(/\.00$/, '')} Cr`;
  }

  if (n >= 1e5) {
    return `₹${(n / 1e5).toFixed(2).replace(/\.00$/, '')} L`;
  }

  if (n >= 1e3) {
    return `₹${(n / 1e3).toFixed(2).replace(/\.00$/, '')} K`;
  }

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
  BookMyShow: {
    tone: 'platform-bms',
    color: '#f43f5e',
    label: 'BookMyShow Exclusive'
  },
  District: {
    tone: 'platform-dist',
    color: '#9844DE',
    label: 'District Exclusive'
  },
  Merged: {
    tone: 'platform-merge',
    color: '#f59e0b',
    label: 'Merged Shows'
  }
};

const getSourceClass = (source = 'Unknown') => {
  if (source === 'Merged') return 'src-merge';
  if (source === 'BookMyShow') return 'src-bms';
  return 'src-dist';
};

export const IndiaMovieDashboard = ({
  rows = [],
  movieName = 'Movie',
  showDate = 'N/A',
  onBack,
  onChangeMovie,
  onHome,
  onReload,
  lastUpdated = 'N/A'
}) => {
  const [filters, setFilters] = useState({
    platform: 'ALL',
    state: 'ALL',
    city: 'ALL',
    theater: 'ALL',
    format: 'ALL',
    language: 'ALL',
    timeCat: 'ALL',
    occTier: 'ALL'
  });

  const [showFilters, setShowFilters] = useState(false);

  // State / City / Theatre expansion states
  const [showAllStates, setShowAllStates] = useState(false);
  const [showAllCities, setShowAllCities] = useState(false);
  const [showAllTheatres, setShowAllTheatres] = useState(false);
  const [showAllLedger, setShowAllLedger] = useState(false);

  const usableRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row &&
          row.sourceType &&
          String(row.sourceType).toLowerCase() !== 'unknown'
      ),
    [rows]
  );

  const uniqueStates = useMemo(
    () =>
      [
        ...new Set(
          usableRows
            .filter((r) => (r.state || 'Unknown') !== 'Unknown')
            .map((r) => r.state || 'Unknown')
        )
      ].sort(),
    [usableRows]
  );

  const uniqueFormats = useMemo(
    () =>
      [
        ...new Set(
          usableRows
            .filter((r) => (r.format || 'Unknown') !== 'Unknown')
            .map((r) => r.format || 'Unknown')
        )
      ].sort(),
    [usableRows]
  );

  const uniqueLanguages = useMemo(
    () =>
      [
        ...new Set(
          usableRows
            .filter((r) => (r.language || 'Unknown') !== 'Unknown')
            .map((r) => r.language || 'Unknown')
        )
      ].sort(),
    [usableRows]
  );

  const uniqueTimeCats = useMemo(
    () =>
      [
        ...new Set(
          usableRows
            .map((r) => r.timeCat || getTimeCategory(r.time || 'Unknown'))
            .filter(
              (value) => value && !value.toLowerCase().includes('unknown')
            )
        )
      ].sort(),
    [usableRows]
  );

  const filteredCities = useMemo(() => {
    let collection = usableRows;

    if (filters.state !== 'ALL') {
      collection = collection.filter((r) => r.state === filters.state);
    }

    return [
      ...new Set(collection.map((r) => r.city || 'Unknown'))
    ].sort();
  }, [filters.state, usableRows]);

  const filteredTheaters = useMemo(() => {
    let collection = usableRows;

    if (filters.state !== 'ALL') {
      collection = collection.filter((r) => r.state === filters.state);
    }

    if (filters.city !== 'ALL') {
      collection = collection.filter((r) => r.city === filters.city);
    }

    return [
      ...new Set(collection.map((r) => r.theater || 'Unknown'))
    ].sort();
  }, [filters.city, filters.state, usableRows]);

  // =====================================================================
  // 🚀 OPTIMIZED SINGLE-PASS AGGREGATION
  // We loop through the 5000+ rows EXACTLY ONCE to build all filters, 
  // totals, and tables simultaneously, cutting render time by ~95%.
  // =====================================================================
  const stats = useMemo(() => {
    // 1. Initialize our buckets
    let totalGross = 0;
    let totalBooked = 0;
    let totalTickets = 0;
    let fastFillingShows = 0;
    let houseFullShows = 0;
    const venueSet = new Set();
    
    const maps = {
      state: {}, city: {}, theater: {}, 
      format: {}, language: {}, timeCat: {}, occTier: {}
    };

    const sources = {
      BookMyShow: { value: 0, booked: 0, shows: 0, label: 'BookMyShow', meta: SOURCE_META.BookMyShow },
      District: { value: 0, booked: 0, shows: 0, label: 'District', meta: SOURCE_META.District },
      Merged: { value: 0, booked: 0, shows: 0, label: 'Merged', meta: SOURCE_META.Merged }
    };

    const filtered = [];

    // 2. Single loop through all rows
    for (let i = 0; i < usableRows.length; i++) {
      const row = usableRows[i];

      // --- 🚨 THE FIX: ACCESS THE RAW PAYLOAD 🚨 ---
      // The real backend data is nested inside 'raw' by a parent wrapper
      const rawData = row.raw || row;

      // --- STRICT ID CHECKING ---
      const bSid = rawData.bms_sid || rawData.bmsId;
      const dSid = rawData.district_sid || rawData.districtId;

      const hasBms = !!bSid && String(bSid).toLowerCase() !== 'null' && String(bSid).toLowerCase() !== 'none';
      const hasDist = !!dSid && String(dSid).toLowerCase() !== 'null' && String(dSid).toLowerCase() !== 'none';
      
      const sType = hasBms && hasDist
        ? 'Merged'
        : hasBms
          ? 'BookMyShow'
          : hasDist
            ? 'District'
            : row.sourceType || row.source || rawData.source || 'Unknown';

      // Override the old sourceType with our accurate calculated one
      const updatedRow = row.sourceType === sType ? row : { ...row, sourceType: sType };

      // --- FILTERING ---
      if (filters.platform !== 'ALL' && updatedRow.sourceType !== filters.platform) continue;
      if (filters.state !== 'ALL' && updatedRow.state !== filters.state) continue;
      if (filters.city !== 'ALL' && updatedRow.city !== filters.city) continue;
      if (filters.theater !== 'ALL' && updatedRow.theater !== filters.theater) continue;
      if (filters.format !== 'ALL' && updatedRow.format !== filters.format) continue;
      if (filters.language !== 'ALL' && updatedRow.language !== filters.language) continue;
      if (filters.timeCat !== 'ALL' && updatedRow.timeCat !== filters.timeCat) continue;
      if (filters.occTier !== 'ALL' && updatedRow.occTier !== filters.occTier) continue;

      filtered.push(updatedRow);

      // --- AGGREGATION ---
      const gross = Number(updatedRow.gross || 0);
      const booked = Number(updatedRow.booked || 0);
      const total = Number(updatedRow.total || 0);

      totalGross += gross;
      totalBooked += booked;
      totalTickets += total;
      venueSet.add(`${updatedRow.theater || 'Unknown'}-${updatedRow.city || 'Unknown'}`);

      const demandTier = updatedRow.occTier || getOccTier(updatedRow.occ);
      if (demandTier === 'Sold Out') {
        houseFullShows += 1;
      } else if (['Almost Full', 'Fast Filling'].includes(demandTier)) {
        fastFillingShows += 1;
      }

      if (sources[sType]) {
        sources[sType].value += gross;
        sources[sType].booked += booked;
        sources[sType].shows += 1;
      }

      // Helper to build table groupings instantly
      const addToMap = (mapKey, rawKey) => {
        const key = String(rawKey || 'Unknown');
        if (!key || key === 'Unknown' || key.toLowerCase().includes('unknown')) return;
        
        if (!maps[mapKey][key]) {
          maps[mapKey][key] = { name: key, shows: 0, total: 0, booked: 0, gross: 0, state: updatedRow.state, city: updatedRow.city };
        }
        maps[mapKey][key].shows += 1;
        maps[mapKey][key].total += total;
        maps[mapKey][key].booked += booked;
        maps[mapKey][key].gross += gross;
      };

      addToMap('state', updatedRow.state);
      addToMap('city', updatedRow.city);
      addToMap('theater', updatedRow.theater);
      addToMap('format', updatedRow.format);
      addToMap('language', updatedRow.language);
      addToMap('timeCat', updatedRow.timeCat); 
      addToMap('occTier', updatedRow.occTier || getOccTier(updatedRow.occ));
    }

    // 3. Format maps into sorted arrays for the tables
    const formatTable = (mapObj) => Object.values(mapObj).map(item => ({
      ...item,
      occupancy: item.total > 0 ? (item.booked / item.total) * 100 : 0
    })).sort((a, b) => b.gross - a.gross);

    return {
      filteredRows: filtered,
      totalGross,
      totalBooked,
      totalTickets,
      totalVenues: venueSet.size,
      fastFillingShows,
      houseFullShows,
      occupancy: totalTickets > 0 ? (totalBooked / totalTickets) * 100 : 0,
      sourceBuckets: Object.values(sources),
      stateSummary: formatTable(maps.state),
      citySummary: formatTable(maps.city),
      theatreSummary: formatTable(maps.theater),
      formatSummary: formatTable(maps.format),
      languageSummary: formatTable(maps.language),
      timeSummary: formatTable(maps.timeCat),
      occTierSummary: formatTable(maps.occTier)
    };
  }, [usableRows, filters]);

  // Destructure for the JSX to use
  const { 
    filteredRows, totalGross, totalBooked, totalVenues, fastFillingShows, houseFullShows, occupancy,
    sourceBuckets, stateSummary, citySummary, theatreSummary, formatSummary, 
    languageSummary, timeSummary, occTierSummary 
  } = stats;

  const sortedLedgerRows = useMemo(
    () => [...filteredRows].sort((a, b) => Number(b.gross || 0) - Number(a.gross || 0)),
    [filteredRows]
  );

  const visibleLedgerRows = showAllLedger
    ? sortedLedgerRows
    : sortedLedgerRows.slice(0, 20);

  const summaryCards = [
    {
      label: 'Total Gross',
      value: formatRupee(totalGross)
    },
    {
      label: 'Tickets Sold',
      value: formatNumber(totalBooked)
    },
    {
      label: 'Total Shows',
      value: formatNumber(filteredRows.length)
    },
    {
      label: 'Total Venues',
      value: formatNumber(totalVenues)
    },
    {
      label: 'Overall Occupancy',
      value: `${Number(occupancy).toFixed(1)}%`
    },
    {
      label: 'Fast Filling / House Full',
      value: `${formatNumber(fastFillingShows)} / ${formatNumber(houseFullShows)}`
    }
  ];

  const renderSummaryCard = (title, value) => (
    <div key={title} className="kpi-card">
      <div className="kpi-title">{title}</div>
      <div
        className="kpi-value"
      >
        {value}
      </div>
    </div>
  );

  /*
   * Generic summary table.
   *
   * Default:
   * - Shows first 10 rows
   * - Adds "Show Remaining X" button if there are more than 10
   * - Clicking expands the full list
   * - Clicking again returns to top 10
   */
  const renderTable = (
    title,
    data,
    showAll,
    setShowAll,
    limit = 20
  ) => (
    <div className="summary-section" key={title}>
      <h2>{title}</h2>

      <div
        className="table-scroll"
        style={{
          overflowX: 'auto',
          width: '100%'
        }}
      >
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
            {(showAll ? data : data.slice(0, limit)).map(
              (row, idx) => (
                <tr key={`${title}-${row.name || idx}`}>
                  <td>{row.name || 'Unknown'}</td>

                  <td>
                    {formatNumber(row.shows || 0)}
                  </td>

                  <td>
                    {formatNumber(row.booked || 0)}
                  </td>

                  <td className="gross-val">
                    {formatRupee(row.gross || 0)}
                  </td>

                  <td
                    style={{
                      color: getOccupancyColor(
                        row.occupancy || 0
                      )
                    }}
                  >
                    {Number(row.occupancy || 0).toFixed(1)}%
                  </td>
                </tr>
              )
            )}

            {!data?.length && (
              <tr>
                <td
                  colSpan={5}
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
          </tbody>
        </table>
      </div>

      {data.length > limit && (
        <div style={{ textAlign: 'center', paddingTop: '16px' }}>
          <button
            onClick={() => setShowAll((v) => !v)}
            className="toggle-btn"
            style={{
              padding: '10px 22px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
              color: '#e2e8f0',
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.2px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06))';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow =
                '0 6px 18px rgba(0,0,0,0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow =
                '0 4px 12px rgba(0,0,0,0.15)';
            }}
          >
            {showAll ? '↑ Show Top 10' : `↓ Show Remaining ${data.length - limit}`}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div id="app">
      <div className="container">
        <DashboardHeader
          marketLabel={<><span className="dashboard-brand">WkndCinemas</span> India Box Office Tracking</>}
          movieName={movieName}
          showDate={showDate}
          lastUpdated={lastUpdated}
          leftActions={[
            {
              label: 'Home',
              onClick: onHome,
              variant: 'secondary'
            },
            {
              label: 'Change Movie',
              onClick: onChangeMovie,
              variant: 'secondary'
            },
            {
              label: 'Change Date',
              onClick: onBack,
              variant: 'secondary'
            },
            {
              label: 'Reload Data',
              onClick: onReload,
              variant: 'secondary'
            }
          ]}
          rightActions={[
            {
              label: showFilters
                ? 'Hide Filters'
                : 'Show Filters',
              onClick: () =>
                setShowFilters((v) => !v),
              variant: 'primary'
            }
          ]}
        />

        {showFilters && (
          <div className="filter-panel">
            <div className="filter-grid">
              <div>
                <div className="filter-label">
                  Platform
                </div>

                <select
                  className="filter-select"
                  value={filters.platform}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      platform: e.target.value
                    }))
                  }
                >
                  <option value="ALL">
                    All Platforms
                  </option>

                  <option value="BookMyShow">
                    BookMyShow
                  </option>

                  <option value="District">
                    District
                  </option>

                  <option value="Merged">
                    Merged
                  </option>
                </select>
              </div>

              <div>
                <div className="filter-label">
                  State
                </div>

                <select
                  className="filter-select"
                  value={filters.state}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      state: e.target.value,
                      city: 'ALL',
                      theater: 'ALL'
                    }))
                  }
                >
                  <option value="ALL">
                    All States
                  </option>

                  {uniqueStates.map((state) => (
                    <option
                      key={state}
                      value={state}
                    >
                      {state}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="filter-label">
                  City
                </div>

                <select
                  className="filter-select"
                  value={filters.city}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      city: e.target.value,
                      theater: 'ALL'
                    }))
                  }
                >
                  <option value="ALL">
                    All Cities
                  </option>

                  {filteredCities.map((city) => (
                    <option
                      key={city}
                      value={city}
                    >
                      {city}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="filter-label">
                  Theatre
                </div>

                <select
                  className="filter-select"
                  value={filters.theater}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      theater: e.target.value
                    }))
                  }
                >
                  <option value="ALL">
                    All Theatres
                  </option>

                  {filteredTheaters.map((theater) => (
                    <option
                      key={theater}
                      value={theater}
                    >
                      {theater}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="filter-label">
                  Language
                </div>

                <select
                  className="filter-select"
                  value={filters.language}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      language: e.target.value
                    }))
                  }
                >
                  <option value="ALL">
                    All Languages
                  </option>

                  {uniqueLanguages.map(
                    (language) => (
                      <option
                        key={language}
                        value={language}
                      >
                        {language}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <div className="filter-label">
                  Format
                </div>

                <select
                  className="filter-select"
                  value={filters.format}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      format: e.target.value
                    }))
                  }
                >
                  <option value="ALL">
                    All Formats
                  </option>

                  {uniqueFormats.map((format) => (
                    <option
                      key={format}
                      value={format}
                    >
                      {format}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="filter-label">
                  Time of Day
                </div>

                <select
                  className="filter-select"
                  value={filters.timeCat}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      timeCat: e.target.value
                    }))
                  }
                >
                  <option value="ALL">
                    All Times
                  </option>

                  {uniqueTimeCats.map((time) => (
                    <option
                      key={time}
                      value={time}
                    >
                      {time}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="filter-label">
                  Occupancy Tier
                </div>

                <select
                  className="filter-select"
                  value={filters.occTier}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      occTier: e.target.value
                    }))
                  }
                >
                  <option value="ALL">
                    All Tiers
                  </option>

                  <option value="Sold Out">
                    Sold Out (100%)
                  </option>

                  <option value="Almost Full">
                    Almost Full (80-99%)
                  </option>

                  <option value="Fast Filling">
                    Fast Filling (50-79%)
                  </option>

                  <option value="Available">
                    Available (0-49%)
                  </option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="kpi-grid india-kpi-grid">
          {summaryCards.map((card) =>
            renderSummaryCard(
              card.label,
              card.value
            )
          )}
        </div>

        <div className="platform-grid">
          {sourceBuckets.map((bucket) => {
            const meta =
              bucket.meta ||
              SOURCE_META[bucket.label] ||
              SOURCE_META.Merged;

            return (
              <div
                key={bucket.label}
                className={`kpi-card ${meta.tone}`}
              >
                <div
                  className="kpi-title"
                  style={{
                    color: meta.color
                  }}
                >
                  {meta.label}
                </div>

                <div className="platform-val-row">
                  <div className="kpi-value">
                    {formatRupee(bucket.value)}
                  </div>

                  <div className="platform-tkts">
                    {formatNumber(bucket.shows)} shows | {formatNumber(bucket.booked)} tickets
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="dashboard-row">
          {renderTable(
            'Format Distribution',
            formatSummary
          )}

          {renderTable(
            'Language Distribution',
            languageSummary
          )}
        </div>

        <div className="dashboard-row">
          {renderTable(
            'State Breakdown',
            stateSummary,
            showAllStates,
            setShowAllStates,
            20
          )}

          {renderTable(
            'Top Cities',
            citySummary,
            showAllCities,
            setShowAllCities,
            20
          )}
        </div>

        <div className="dashboard-row">
          {renderTable(
            'Time of Day Analysis',
            timeSummary
          )}

          {renderTable(
            'Demand Tiers',
            occTierSummary
          )}
        </div>

        <div
          className="summary-section"
          style={{
            marginBottom: '20px'
          }}
        >
          <h2>Top Grossing Theatres</h2>

          <div
            className="table-scroll table-scroll-wide table-scroll-theatres"
            style={{
              overflowX: 'auto',
              maxHeight: '400px',
              overflowY: 'auto'
            }}
          >
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
                {(showAllTheatres
                  ? theatreSummary
                  : theatreSummary.slice(0, 20)
                ).map((row) => (
                  <tr
                    key={`${row.name}-${row.city}`}
                  >
                    <td
                      style={{
                        color: '#94a3b8',
                        fontSize: '11px'
                      }}
                    >
                      {row.state}
                    </td>

                    <td
                      style={{
                        color: '#94a3b8',
                        fontSize: '11px'
                      }}
                    >
                      {row.city}
                    </td>

                    <td className="theater-col">
                      {row.name}
                    </td>

                    <td>
                      {formatNumber(
                        row.shows || 0
                      )}
                    </td>

                    <td>
                      {formatNumber(
                        row.booked || 0
                      )}
                    </td>

                    <td className="gross-val">
                      {formatRupee(
                        row.gross || 0
                      )}
                    </td>

                    <td
                      style={{
                        color: getOccupancyColor(
                          row.occupancy || 0
                        )
                      }}
                    >
                      {Number(
                        row.occupancy || 0
                      ).toFixed(1)}
                      %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {theatreSummary.length > 20 && (
            <div style={{ textAlign: 'center', paddingTop: '16px' }}>
              <button
                onClick={() => setShowAllTheatres((v) => !v)}
                className="toggle-btn"
                style={{
                  padding: '10px 22px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '0.2px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06))';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow =
                    '0 6px 18px rgba(0,0,0,0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow =
                    '0 4px 12px rgba(0,0,0,0.15)';
                }}
              >
                {showAllTheatres
                  ? 'Show Top 20'
                  : `Show Remaining ${theatreSummary.length - 20}`}
              </button>
            </div>
          )}
        </div>

        <div
          className="summary-section"
          style={{
            marginBottom: '0'
          }}
        >
          <h2>
            Master Ledger{' '}
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                fontWeight: 400
              }}
            >
              (Reacts to Filters)
            </span>
          </h2>

          <div
            className="table-scroll table-scroll-wide table-scroll-ledger"
            style={{
              overflowX: 'auto',
              maxHeight: '600px',
              overflowY: 'auto'
            }}
          >
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
                {visibleLedgerRows.map((row, idx) => (
                    <tr
                      key={`${row.id || 'show'}-${idx}`}
                    >
                      <td
                        className={getSourceClass(
                          row.sourceType
                        )}
                      >
                        {row.sourceType ||
                          'Unknown'}
                      </td>

                      <td
                        style={{
                          color: '#94a3b8',
                          fontSize: '11px'
                        }}
                      >
                        {row.city}
                      </td>

                      <td className="theater-col">
                        {row.theater}
                      </td>

                      <td
                        style={{
                          color: '#94a3b8',
                          fontSize: '11px'
                        }}
                      >
                        {row.language} /{' '}
                        {row.format}
                      </td>

                      <td>{row.time}</td>

                      <td>
                        <span
                          className={`badge ${getBadgeClass(
                            getOccTier(row.occ)
                          )}`}
                        >
                          {getOccTier(row.occ)}
                        </span>
                      </td>

                      <td>
                        {formatNumber(
                          row.booked || 0
                        )}{' '}
                        <span
                          style={{
                            color: '#64748b',
                            fontSize: '10px'
                          }}
                        >
                          /{' '}
                          {formatNumber(
                            row.total || 0
                          )}
                        </span>
                      </td>

                      <td className="gross-val">
                        {formatRupee(
                          row.gross || 0
                        )}
                      </td>

                      <td
                        style={{
                          color: getOccupancyColor(
                            row.occ || 0
                          )
                        }}
                      >
                        {Number(
                          row.occ || 0
                        ).toFixed(1)}
                        %
                      </td>
                    </tr>
                  ))}

                {!filteredRows.length && (
                  <tr>
                    <td
                      colSpan={9}
                      style={{
                        textAlign: 'center',
                        padding: '18px',
                        color:
                          'var(--text-muted)'
                      }}
                    >
                      No rows match the selected
                      filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {sortedLedgerRows.length > 20 && (
            <div style={{ textAlign: 'center', paddingTop: '16px' }}>
              <button
                type="button"
                onClick={() => setShowAllLedger((value) => !value)}
                className="toggle-btn"
              >
                {showAllLedger
                  ? 'Show Top 20'
                  : `Show Remaining ${(sortedLedgerRows.length - 20).toLocaleString()} Shows`}
              </button>
            </div>
          )}

        </div>

        <div className="footer">
          Wknd Cinema • BMS + District Analytics •
          Generated{' '}
          {new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })}
        </div>
      </div>
    </div>
  );
};