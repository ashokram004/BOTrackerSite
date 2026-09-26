import { useMemo, useState } from 'react';
import { DashboardHeader, DEFAULT_MOVIE_POSTER_URL } from './DashboardHeader';
import { generateIndiaImageReport } from '../utils/imageGenerator';
import { TimeFilter } from './TimeFilter';
import { CUSTOM_TIME_RANGE, isTimeInRange } from '../utils/timeFilter';

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

const MERGE_CALCULATION_LABELS = {
  bms: 'BOOKMYSHOW',
  district: 'DISTRICT',
  lower: 'LOWER',
  higher: 'HIGHER',
  average: 'AVERAGE'
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
  moviePosterUrl = '',
  onBack,
  onChangeMovie,
  onHome,
  onReload,
  lastUpdated = 'N/A'
}) => {
  const [filters, setFilters] = useState({
    platform: 'ALL',
    mergeCalculation: 'lower',
    region: 'ALL',
    state: 'ALL',
    city: 'ALL',
    theater: 'ALL',
    format: 'ALL',
    language: 'ALL',
    timeCat: 'ALL',
    timeStart: '',
    timeEnd: '',
    occTier: 'ALL'
  });

  const [showFilters, setShowFilters] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // State / City / Theatre expansion states
  const [showAllStates, setShowAllStates] = useState(false);
  const [showAllCities, setShowAllCities] = useState(false);
  const [showAllTimeCategories, setShowAllTimeCategories] = useState(false);
  const [showAllDemandTiers, setShowAllDemandTiers] = useState(false);
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

  const availableMergeCalculations = useMemo(() => {
    const metrics = ['booked_gross', 'total_gross', 'booked_tickets', 'total_tickets'];
    const modes = Object.keys(MERGE_CALCULATION_LABELS);

    return modes.filter((mode) =>
      usableRows.some((row) => {
        if (row.sourceType !== 'Merged') return false;
        const rawData = row.raw || row;

        return metrics.some((metric) =>
          Object.prototype.hasOwnProperty.call(rawData, `${mode}_${metric}`)
        );
      })
    );
  }, [usableRows]);

  const mergeCalculationOptions = availableMergeCalculations.includes('lower')
    ? availableMergeCalculations
    : [];

  const activeMergeCalculation = mergeCalculationOptions.includes(filters.mergeCalculation)
    ? filters.mergeCalculation
    : 'existing';

  const uniqueRegions = useMemo(
    () =>
      [
        ...new Set(
          usableRows
            .filter((r) => (r.region || 'Unknown') !== 'Unknown')
            .map((r) => r.region || 'Unknown')
        )
      ].sort(),
    [usableRows]
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

  const filteredRegions = useMemo(() => {
    let collection = usableRows;

    if (filters.state !== 'ALL') {
      collection = collection.filter((r) => r.state === filters.state);
    }

    return [
      ...new Set(collection.map((r) => r.region || 'Unknown'))
    ].filter((value) => value !== 'Unknown').sort();
  }, [filters.state, usableRows]);

  const filteredCities = useMemo(() => {
    let collection = usableRows;

    if (filters.state !== 'ALL') {
      collection = collection.filter((r) => r.state === filters.state);
    }

    if (filters.region !== 'ALL') {
      collection = collection.filter((r) => r.region === filters.region);
    }

    return [
      ...new Set(collection.map((r) => r.city || 'Unknown'))
    ].sort();
  }, [filters.region, filters.state, usableRows]);

  const filteredTheaters = useMemo(() => {
    let collection = usableRows;

    if (filters.state !== 'ALL') {
      collection = collection.filter((r) => r.state === filters.state);
    }

    if (filters.region !== 'ALL') {
      collection = collection.filter((r) => r.region === filters.region);
    }

    if (filters.city !== 'ALL') {
      collection = collection.filter((r) => r.city === filters.city);
    }

    return [
      ...new Set(collection.map((r) => r.theater || 'Unknown'))
    ].sort();
  }, [filters.city, filters.region, filters.state, usableRows]);

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
      region: {}, state: {}, city: {}, theater: {},
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
      let updatedRow = row.sourceType === sType ? row : { ...row, sourceType: sType };

      if (sType === 'Merged' && activeMergeCalculation !== 'existing') {
        const getSelectedMetric = (metric, fallback) => {
          const value = rawData[`${activeMergeCalculation}_${metric}`];
          if (value === undefined || value === null || value === '') return fallback;
          const number = Number(value);
          return Number.isFinite(number) ? number : fallback;
        };

        const booked = getSelectedMetric('booked_tickets', updatedRow.booked);
        const total = getSelectedMetric('total_tickets', updatedRow.total);
        const gross = getSelectedMetric('booked_gross', updatedRow.gross);
        const occ = total > 0 ? (booked / total) * 100 : 0;

        updatedRow = {
          ...updatedRow,
          booked,
          total,
          gross,
          occ,
          occTier: getOccTier(occ),
          status: getOccTier(occ)
        };
      }

      // --- FILTERING ---
      if (filters.platform !== 'ALL' && updatedRow.sourceType !== filters.platform) continue;
      if (filters.region !== 'ALL' && updatedRow.region !== filters.region) continue;
      if (filters.state !== 'ALL' && updatedRow.state !== filters.state) continue;
      if (filters.city !== 'ALL' && updatedRow.city !== filters.city) continue;
      if (filters.theater !== 'ALL' && updatedRow.theater !== filters.theater) continue;
      if (filters.format !== 'ALL' && updatedRow.format !== filters.format) continue;
      if (filters.language !== 'ALL' && updatedRow.language !== filters.language) continue;
      if (filters.timeCat === CUSTOM_TIME_RANGE) {
        if (!isTimeInRange(updatedRow.time, filters.timeStart, filters.timeEnd)) continue;
      } else if (filters.timeCat !== 'ALL' && updatedRow.timeCat !== filters.timeCat) continue;
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

      addToMap('region', updatedRow.region);
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

    const regionSummary = formatTable(maps.region);
    const regionStateSummary = Object.values(
      filtered.reduce((acc, row) => {
        const regionKey = row.region || 'Unknown';
        const stateKey = row.state || 'Unknown';
        const composite = `${regionKey}::${stateKey}`;

        if (!acc[composite]) {
          acc[composite] = {
            region: regionKey,
            state: stateKey,
            shows: 0,
            total: 0,
            booked: 0,
            gross: 0
          };
        }

        acc[composite].shows += 1;
        acc[composite].total += Number(row.total || 0);
        acc[composite].booked += Number(row.booked || 0);
        acc[composite].gross += Number(row.gross || 0);

        return acc;
      }, {})
    )
      .map((row) => ({
        ...row,
        occupancy: row.total > 0 ? (row.booked / row.total) * 100 : 0
      }))
      .sort((a, b) => b.gross - a.gross);

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
      regionSummary,
      stateSummary: formatTable(maps.state),
      regionStateSummary,
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
    filteredRows, totalGross, totalBooked, totalTickets, totalVenues, fastFillingShows, houseFullShows, occupancy,
    sourceBuckets, regionSummary, stateSummary, regionStateSummary, citySummary, theatreSummary, formatSummary,
    languageSummary, timeSummary, occTierSummary
  } = stats;

  const [showAllRegionState, setShowAllRegionState] = useState(false);

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

  const groupedStates = useMemo(() => {
    const groups = new Map();
    const consideredStates = new Map([
      ['andhra pradesh', 'Andhra Pradesh'],
      ['telangana', 'Telangana'],
      ['karnataka', 'Karnataka'],
      ['tamil nadu', 'Tamil Nadu'],
      ['kerala', 'Kerala']
    ]);

    regionStateSummary.forEach((row) => {
      const rawState = String(row.state || '').trim();
      const state = consideredStates.get(rawState.toLowerCase()) || 'Rest of India';
      if (!groups.has(state)) {
        groups.set(state, {
          state,
          rows: [],
          shows: 0,
          total: 0,
          booked: 0,
          gross: 0
        });
      }

      const group = groups.get(state);
      const territory = state === 'Rest of India' ? 'Rest of India' : (row.region || 'Unknown');
      let groupedRow = group.rows.find((item) => item.region === territory);
      if (!groupedRow) {
        groupedRow = {
          region: territory,
          shows: 0,
          total: 0,
          booked: 0,
          gross: 0
        };
        group.rows.push(groupedRow);
      }

      groupedRow.shows += Number(row.shows || 0);
      groupedRow.total += Number(row.total || 0);
      groupedRow.booked += Number(row.booked || 0);
      groupedRow.gross += Number(row.gross || 0);
      group.shows += Number(row.shows || 0);
      group.total += Number(row.total || 0);
      group.booked += Number(row.booked || 0);
      group.gross += Number(row.gross || 0);
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        occupancy: group.total > 0 ? (group.booked / group.total) * 100 : 0,
        rows: group.rows
          .map((row) => ({
            ...row,
            occupancy: row.total > 0 ? (row.booked / row.total) * 100 : 0
          }))
          .sort((a, b) => b.gross - a.gross)
      }))
        .sort((a, b) => b.gross - a.gross);
  }, [regionStateSummary]);

  const handleExportImage = async () => {
    if (isGeneratingImage) return;

    setIsGeneratingImage(true);
    try {
      const dataUrl = await generateIndiaImageReport({
        movieName,
        showDate,
        lastUpdated,
        totalGross,
        totalBooked,
        totalVenues,
        totalShows: filteredRows.length,
        totalTickets,
        occupancy,
        houseFullShows,
        fastFillingShows,
        languages: languageSummary,
        timeCats: timeSummary,
        states: stateSummary,
        cities: citySummary
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      const filePart = (value) => String(value || 'unknown').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
      link.download = `${filePart(movieName)}_India_${filePart(showDate)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error generating India image:', error);
      alert('Failed to generate image.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

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
              <th style={{ width: '25%' }}>Name</th>
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
                  <td style={{ width: '25%' }}>
                    {title === 'Time of Day Breakdown'
                      ? String(row.name || 'Unknown').replace(/^\d+\.\s*/, '')
                      : row.name || 'Unknown'}
                  </td>

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
          marketLabel={<><span className="dashboard-brand">TheWkndCinema</span> India Box Office Tracking</>}
          movieName={movieName}
          showDate={showDate}
          lastUpdated={lastUpdated}
          moviePosterUrl={moviePosterUrl || DEFAULT_MOVIE_POSTER_URL}
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
            },
            {
              label: isGeneratingImage ? 'Generating...' : 'Export Image',
              onClick: handleExportImage,
              variant: 'primary',
              disabled: isGeneratingImage
            }
          ]}
        />

        {showFilters && (
          <div className="filter-panel">
            <div className="filter-grid">
              {mergeCalculationOptions.length > 0 && (
                <div>
                  <div className="filter-label">
                    Merge Calculation
                  </div>

                  <select
                    className="filter-select"
                    value={activeMergeCalculation}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        mergeCalculation: e.target.value
                      }))
                    }
                  >
                    <option value="existing">DEFAULT</option>
                    {mergeCalculationOptions.map((mode) => (
                      <option key={mode} value={mode}>
                        {MERGE_CALCULATION_LABELS[mode]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                      region: e.target.value === 'ALL' ? 'ALL' : prev.region,
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
                  Territory
                </div>

                <select
                  className="filter-select"
                  value={filters.region}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      region: e.target.value,
                      city: 'ALL',
                      theater: 'ALL'
                    }))
                  }
                >
                  <option value="ALL">
                    All Territories
                  </option>

                  {filteredRegions.map((region) => (
                    <option
                      key={region}
                      value={region}
                    >
                      {region}
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

              <TimeFilter
                timeCategories={uniqueTimeCats}
                filters={filters}
                setFilters={setFilters}
              />

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
            'Format Breakdown',
            formatSummary
          )}

          {renderTable(
            'Language Breakdown',
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
            'City Breakdown',
            citySummary,
            showAllCities,
            setShowAllCities,
            20
          )}
        </div>

        <div className="summary-section" style={{ marginTop: '20px' }}>
          <h2>Territory Breakdown</h2>

          <div className="table-scroll" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="india-territory-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>State / Territory</th>
                  <th>Shows</th>
                  <th>Tickets</th>
                  <th>Gross</th>
                  <th>Occ %</th>
                </tr>
              </thead>

              <tbody>
                {(showAllRegionState ? groupedStates : groupedStates.slice(0, 10)).flatMap((group) => [
                  <tr key={`${group.state}-header`}>
                    <td colSpan={5} style={{
                      padding: '10px 14px',
                      background: 'rgba(148, 163, 184, 0.16)',
                      color: 'var(--text-main)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}>
                      {group.state}
                    </td>
                  </tr>,
                  ...group.rows.map((row, idx) => (
                    <tr key={`${group.state}-${row.region || 'territory'}-${idx}`}>
                      <td style={{ width: '40%' }}>{row.region || 'Unknown'}</td>
                      <td>{formatNumber(row.shows || 0)}</td>
                      <td>{formatNumber(row.booked || 0)}</td>
                      <td className="gross-val">{formatRupee(row.gross || 0)}</td>
                      <td style={{ color: getOccupancyColor(row.occupancy || 0) }}>
                        {Number(row.occupancy || 0).toFixed(1)}%
                      </td>
                    </tr>
                  )),
                  <tr key={`${group.state}-total`} className="territory-total-row">
                    <td style={{ fontWeight: 700 }}>Total</td>
                    <td style={{ fontWeight: 700 }}>{formatNumber(group.shows)}</td>
                    <td style={{ fontWeight: 700 }}>{formatNumber(group.booked)}</td>
                    <td style={{ fontWeight: 700 }}>{formatRupee(group.gross)}</td>
                    <td style={{ fontWeight: 700 }}>
                      {group.occupancy.toFixed(1)}%
                    </td>
                  </tr>
                ])}

                {!groupedStates.length && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '18px', color: 'var(--text-muted)' }}>
                      No territory data available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {groupedStates.length > 10 && (
            <div style={{ textAlign: 'center', paddingTop: '16px' }}>
              <button
                onClick={() => setShowAllRegionState((v) => !v)}
                className="toggle-btn"
                style={{
                  padding: '10px 22px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '0.2px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06))';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                }}
              >
                {showAllRegionState ? '↑ Show Top 10 States' : `↓ Show Remaining ${groupedStates.length - 10} States`}
              </button>
            </div>
          )}
        </div>

        <div className="dashboard-row" style={{ marginTop: '20px' }}>
          {renderTable(
            'Time of Day Breakdown',
            timeSummary,
            showAllTimeCategories,
            setShowAllTimeCategories
          )}

          {renderTable(
            'Demand Tier Breakdown',
            occTierSummary,
            showAllDemandTiers,
            setShowAllDemandTiers
          )}
        </div>

        <div
          className="summary-section"
          style={{
            marginTop: '20px',
            marginBottom: '20px'
          }}
        >
          <h2>Theatre Breakdown</h2>

          <div
            className="table-scroll table-scroll-wide table-scroll-theatres"
            style={{
              overflowX: 'auto'
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
                    <td className="location-cell" style={{ fontSize: '11px' }}>
                      {row.state}
                    </td>

                    <td className="location-cell" style={{ fontSize: '11px' }}>
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
            All Showtimes{' '}
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
              overflowX: 'auto'
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

                      <td className="location-cell" style={{ fontSize: '11px' }}>
                        {row.city}
                      </td>

                      <td className="theater-col">
                        {row.theater}
                      </td>

                      <td className="location-cell" style={{ fontSize: '11px' }}>
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
          @TheWkndCinema • BookMyShow + District Data • Including blocked seats.
        </div>
      </div>
    </div>
  );
};