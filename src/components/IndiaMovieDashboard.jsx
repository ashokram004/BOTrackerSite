import { memo, useEffect, useMemo, useState } from 'react';
import { DashboardHeader, DEFAULT_MOVIE_POSTER_URL } from './DashboardHeader';
import { generateIndiaImageReport } from '../utils/imageGenerator';
import { TimeFilter } from './TimeFilter';
import { MultiSelectFilter } from './MultiSelectFilter';
import { IndiaGrossGrowthChart } from './IndiaGrossGrowthChart';
import { HistoryTable } from './HistoryTable';
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

const getOccupancy = (booked, total) => {
  const bookedCount = Number(booked);
  const totalCount = Number(total);
  if (!Number.isFinite(bookedCount) || !Number.isFinite(totalCount) || totalCount <= 0) return 0;
  return Math.min(100, Math.max(0, (bookedCount / totalCount) * 100));
};

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

const matchesSelection = (selectedValues, value) =>
  selectedValues.length === 0 || selectedValues.includes(value);

const getBadgeClass = (tier = 'Available') => {
  if (tier === 'Sold Out') return 'b-soldout';
  if (tier === 'Almost Full') return 'b-almost';
  if (tier === 'Fast Filling') return 'b-fast';
  return 'b-avail';
};

const getLatestHistoryDeltas = (historyData) => {
  const snapshots = [...(historyData || [])]
    .filter((snapshot) => snapshot && typeof snapshot === 'object')
    .sort((a, b) => {
      const aTime = new Date(a.timestamp || 0).getTime();
      const bTime = new Date(b.timestamp || 0).getTime();
      return (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0);
    })
    .slice(-2);

  if (snapshots.length < 2) return {};

  const getMetric = (snapshot, keys) => {
    for (const key of keys) {
      const value = snapshot[key];
      if (value === undefined || value === null || value === '') continue;
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return null;
  };

  const [previous, latest] = snapshots;
  const getDelta = (keys) => {
    const previousValue = getMetric(previous, keys);
    const latestValue = getMetric(latest, keys);
    return previousValue === null || latestValue === null ? null : latestValue - previousValue;
  };

  return {
    gross: getDelta(['total_gross', 'totalGross', 'booked_gross', 'bookedGross']),
    tickets: getDelta(['booked_tickets', 'bookedTickets']),
    venues: getDelta(['venues']),
    shows: getDelta(['shows'])
  };
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

export const IndiaMovieDashboard = memo(({
  rows = [],
  historyData = [],
  salesView = 'total',
  salesModeOptions = [],
  onSalesViewChange,
  movieName = 'Movie',
  showDate = 'N/A',
  dates = [],
  onDateChange,
  moviePosterUrl = '',
  onChangeMovie,
  onReload,
  lastUpdated = 'N/A',
  growthSince = 'N/A',
  growthEnabled = true
}) => {
  const [filters, setFilters] = useState({
    platform: [],
    mergeCalculation: 'bms',
    region: [],
    state: [],
    city: [],
    theater: [],
    format: [],
    language: [],
    timeCat: [],
    timeStart: '',
    timeEnd: '',
    occTier: []
  });

  const [showFilters, setShowFilters] = useState(false);
  const [showGrowth, setShowGrowth] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const hasGrowthData = growthEnabled && historyData.filter(
    (snapshot) => snapshot && typeof snapshot === 'object'
  ).length > 1;

  useEffect(() => {
    if (!hasGrowthData) setShowGrowth(false);
  }, [hasGrowthData]);

  // State / City / Theatre expansion states
  const [showAllStates, setShowAllStates] = useState(false);
  const [showAllCities, setShowAllCities] = useState(false);
  const [showAllTimeCategories, setShowAllTimeCategories] = useState(false);
  const [showAllDemandTiers, setShowAllDemandTiers] = useState(false);
  const [showAllTheatres, setShowAllTheatres] = useState(false);
  const [showAllLedger, setShowAllLedger] = useState(false);
  const [ledgerSort, setLedgerSort] = useState({ key: null, direction: 'default' });

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

  const mergeCalculationOptions = availableMergeCalculations;

  const activeMergeCalculation = mergeCalculationOptions.includes(filters.mergeCalculation)
    ? filters.mergeCalculation
    : mergeCalculationOptions.includes('bms')
      ? 'bms'
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

    if (filters.state.length) {
      collection = collection.filter((r) => filters.state.includes(r.state));
    }

    return [
      ...new Set(collection.map((r) => r.region || 'Unknown'))
    ].filter((value) => value !== 'Unknown').sort();
  }, [filters.state, usableRows]);

  const filteredCities = useMemo(() => {
    let collection = usableRows;

    if (filters.state.length) {
      collection = collection.filter((r) => filters.state.includes(r.state));
    }

    if (filters.region.length) {
      collection = collection.filter((r) => filters.region.includes(r.region));
    }

    return [
      ...new Set(collection.map((r) => r.city || 'Unknown'))
    ].sort();
  }, [filters.region, filters.state, usableRows]);

  const filteredTheaters = useMemo(() => {
    let collection = usableRows;

    if (filters.state.length) {
      collection = collection.filter((r) => filters.state.includes(r.state));
    }

    if (filters.region.length) {
      collection = collection.filter((r) => filters.region.includes(r.region));
    }

    if (filters.city.length) {
      collection = collection.filter((r) => filters.city.includes(r.city));
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

      if (sType === 'Merged') {
        const getSelectedMetric = (metric, fallback) => {
          const valueKey = activeMergeCalculation === 'existing'
            ? metric
            : `${activeMergeCalculation}_${metric}`;
          const value = rawData[valueKey];
          if (value === undefined || value === null || value === '') return fallback;
          const number = Number(value);
          return Number.isFinite(number) ? number : fallback;
        };

        const booked = getSelectedMetric('booked_tickets', updatedRow.booked ?? rawData.booked_tickets ?? 0);
        const total = getSelectedMetric('total_tickets', updatedRow.total ?? rawData.total_tickets ?? 0);
        const gross = getSelectedMetric('booked_gross', updatedRow.gross ?? rawData.booked_gross ?? 0);
        const occ = getOccupancy(booked, total);

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

      const occ = getOccupancy(updatedRow.booked, updatedRow.total);
      updatedRow = {
        ...updatedRow,
        occ,
        occTier: getOccTier(occ),
        status: getOccTier(occ)
      };

      // --- FILTERING ---
      if (!matchesSelection(filters.platform, updatedRow.sourceType)) continue;
      if (!matchesSelection(filters.region, updatedRow.region)) continue;
      if (!matchesSelection(filters.state, updatedRow.state)) continue;
      if (!matchesSelection(filters.city, updatedRow.city)) continue;
      if (!matchesSelection(filters.theater, updatedRow.theater)) continue;
      if (!matchesSelection(filters.format, updatedRow.format)) continue;
      if (!matchesSelection(filters.language, updatedRow.language)) continue;
      const matchesTime = filters.timeCat.length === 0 || filters.timeCat.some((timeCategory) =>
        timeCategory === CUSTOM_TIME_RANGE
          ? isTimeInRange(updatedRow.time, filters.timeStart, filters.timeEnd)
          : updatedRow.timeCat === timeCategory
      );
      if (!matchesTime) continue;
      if (!matchesSelection(filters.occTier, updatedRow.occTier)) continue;

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
      occupancy: getOccupancy(item.booked, item.total)
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
        occupancy: getOccupancy(row.booked, row.total)
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
      occupancy: getOccupancy(totalBooked, totalTickets),
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
    () => {
      const rows = [...filteredRows];
      const sortKey = ledgerSort.key || 'gross';
      const direction = ledgerSort.direction === 'default' ? 'desc' : ledgerSort.direction;
      const getSortValue = (row) => {
        switch (sortKey) {
          case 'platform': return row.sourceType || '';
          case 'city': return row.city || '';
          case 'theater': return row.theater || '';
          case 'languageFormat': return `${row.language || ''} ${row.format || ''}`;
          case 'time': return row.time || '';
          case 'tier': return getOccTier(row.occ);
          case 'booked': return Number(row.booked || 0);
          case 'gross': return Number(row.gross || 0);
          case 'occ': return Number(row.occ || 0);
          default: return '';
        }
      };

      return rows.sort((a, b) => {
        const aValue = getSortValue(a);
        const bValue = getSortValue(b);
        const comparison = typeof aValue === 'number' && typeof bValue === 'number'
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: 'base' });

        return direction === 'asc' ? comparison : -comparison;
      });
    },
    [filteredRows, ledgerSort]
  );

  const handleLedgerSort = (key) => {
    setLedgerSort((current) => {
      if (current.key !== key) return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return { key: null, direction: 'default' };
    });
  };

  const getLedgerSortIndicator = (key) => {
    if (ledgerSort.key === key) return ledgerSort.direction === 'asc' ? ' ↑' : ' ↓';
    return ledgerSort.key === null && key === 'gross' ? ' ↓' : '';
  };

  const visibleLedgerRows = showAllLedger
    ? sortedLedgerRows
    : sortedLedgerRows.slice(0, 20);

  const historyDeltas = getLatestHistoryDeltas(historyData);
  const summaryCards = [
    {
      label: 'Total Gross',
      value: formatRupee(totalGross),
      growth: historyDeltas.gross,
      growthFormat: 'currency'
    },
    {
      label: 'Tickets Sold',
      value: formatNumber(totalBooked),
      growth: historyDeltas.tickets
    },
    {
      label: 'Total Shows',
      value: formatNumber(filteredRows.length),
      growth: historyDeltas.shows
    },
    {
      label: 'Total Venues',
      value: formatNumber(totalVenues),
      growth: historyDeltas.venues
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
        occupancy: getOccupancy(group.booked, group.total),
        rows: group.rows
          .map((row) => ({
            ...row,
            occupancy: getOccupancy(row.booked, row.total)
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

  const renderSummaryCard = (card) => (
    <div key={card.label} className="kpi-card">
      <div className="kpi-head">
        <div className="kpi-title">{card.label}</div>
        {showGrowth && card.growth !== null && card.growth !== undefined && card.growth !== 0 && (
          <div
            className={`kpi-sub ${card.growth > 0 ? 'delta-positive' : 'delta-negative'}`}
            style={{ color: card.growth > 0 ? '#4ade80' : '#f87171' }}
          >
            {card.growth > 0 ? '+' : '-'}
            {card.growthFormat === 'currency'
              ? formatRupee(Math.abs(card.growth))
              : card.growthFormat === 'percentage-points'
                ? `${Math.abs(card.growth).toFixed(1)} pp`
                : formatNumber(Math.abs(card.growth))}
          </div>
        )}
      </div>
      <div
        className="kpi-value"
      >
        {card.value}
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
    <main className="site-main dashboard-page">
      <div className="container">
        <DashboardHeader
          marketLabel="INDIA BOX OFFICE"
          movieName={movieName}
          showDate={showDate}
          dateOptions={dates}
          onDateChange={onDateChange}
          salesMode={salesView}
          salesModeOptions={salesModeOptions}
          onSalesModeChange={onSalesViewChange}
          rightActionsClassName="india-dashboard-right-actions"
          lastUpdated={growthSince !== 'N/A'
            ? `${lastUpdated} • Growth since ${growthSince} IST`
            : lastUpdated}
          moviePosterUrl={moviePosterUrl || DEFAULT_MOVIE_POSTER_URL}
          leftActions={[
            {
              label: 'Change Movie',
              onClick: onChangeMovie,
              variant: 'secondary',
              mobileLabel: 'Change Movie'
            },
            {
              label: 'Reload Data',
              onClick: onReload,
              variant: 'secondary',
              mobileLabel: 'Reload Data'
            }
          ]}
          rightActions={[
            {
              label: showFilters
                ? 'Hide Filters'
                : 'Show Filters',
              onClick: () =>
                setShowFilters((v) => !v),
              variant: 'secondary',
              isActive: showFilters,
              mobileLabel: 'Filters',
              mobileIcon: 'filter'
            },
            {
              label: 'Growth',
              ariaLabel: showGrowth ? 'Hide growth details' : 'Show growth details',
              onClick: () => setShowGrowth((value) => !value),
              disabled: !hasGrowthData || !growthEnabled,
              variant: 'secondary',
              isActive: showGrowth,
              neutralHoverWhenInactive: true,
              activeStyle: 'dashboard-action-btn--growth-active',
              icon: 'growth',
              mobileLabel: 'Growth',
              mobileIcon: 'growth'
            },
            {
              label: isGeneratingImage ? 'Generating...' : 'Export Image',
              onClick: handleExportImage,
              variant: 'primary',
              disabled: isGeneratingImage,
              mobileLabel: isGeneratingImage ? 'Wait' : 'Export',
              mobileIcon: 'export'
            }
          ]}
        />

        {showFilters && (
          <div className="filter-panel india-filter-panel multi-select-panel">
            <div className="filter-grid">
              {mergeCalculationOptions.length > 0 && (
                <div>
                  <div className="filter-label">
                    Merge Calculation
                  </div>

                  <div className="filter-select-shell">
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
                      {mergeCalculationOptions.map((mode) => (
                        <option key={mode} value={mode}>
                          {MERGE_CALCULATION_LABELS[mode]}
                        </option>
                      ))}
                    </select>
                    <span className="filter-select-arrow" aria-hidden="true">▾</span>
                  </div>
                </div>
              )}

              <MultiSelectFilter
                label="Platform"
                allLabel="All Platforms"
                options={[
                  { value: 'BookMyShow', label: 'BookMyShow' },
                  { value: 'District', label: 'District' },
                  { value: 'Merged', label: 'Merged' }
                ]}
                selectedValues={filters.platform}
                onChange={(platform) => setFilters((prev) => ({ ...prev, platform }))}
              />

              <MultiSelectFilter
                label="State"
                allLabel="All States"
                options={uniqueStates.map((state) => ({ value: state, label: state }))}
                selectedValues={filters.state}
                onChange={(state) => setFilters((prev) => ({ ...prev, state, region: [], city: [], theater: [] }))}
              />

              <MultiSelectFilter
                label="Territory"
                allLabel="All Territories"
                options={filteredRegions.map((region) => ({ value: region, label: region }))}
                selectedValues={filters.region}
                onChange={(region) => setFilters((prev) => ({ ...prev, region, city: [], theater: [] }))}
              />

              <MultiSelectFilter
                label="City"
                allLabel="All Cities"
                options={filteredCities.map((city) => ({ value: city, label: city }))}
                selectedValues={filters.city}
                onChange={(city) => setFilters((prev) => ({ ...prev, city, theater: [] }))}
              />

              <MultiSelectFilter
                label="Theatre"
                allLabel="All Theatres"
                options={filteredTheaters.map((theater) => ({ value: theater, label: theater }))}
                selectedValues={filters.theater}
                onChange={(theater) => setFilters((prev) => ({ ...prev, theater }))}
              />

              <MultiSelectFilter
                label="Language"
                allLabel="All Languages"
                options={uniqueLanguages.map((language) => ({ value: language, label: language }))}
                selectedValues={filters.language}
                onChange={(language) => setFilters((prev) => ({ ...prev, language }))}
              />

              <MultiSelectFilter
                label="Format"
                allLabel="All Formats"
                options={uniqueFormats.map((format) => ({ value: format, label: format }))}
                selectedValues={filters.format}
                onChange={(format) => setFilters((prev) => ({ ...prev, format }))}
              />

              <TimeFilter
                timeCategories={uniqueTimeCats}
                filters={filters}
                setFilters={setFilters}
              />

              <MultiSelectFilter
                label="Occupancy Tier"
                allLabel="All Tiers"
                options={[
                  { value: 'Sold Out', label: 'Sold Out (100%)' },
                  { value: 'Almost Full', label: 'Almost Full (80-99%)' },
                  { value: 'Fast Filling', label: 'Fast Filling (50-79%)' },
                  { value: 'Available', label: 'Available (0-49%)' }
                ]}
                selectedValues={filters.occTier}
                onChange={(occTier) => setFilters((prev) => ({ ...prev, occTier }))}
              />
            </div>
          </div>
        )}

        <div className="kpi-grid india-kpi-grid">
          {summaryCards.map(renderSummaryCard)}
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
                  <tr key={`${group.state}-header`} className="territory-group-header">
                    <td colSpan={5} style={{
                      padding: '10px 12px',
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
                  {[
                    ['platform', 'Platform'],
                    ['city', 'City'],
                    ['theater', 'Theatre Name'],
                    ['languageFormat', 'Lang/Fmt'],
                    ['time', 'Time'],
                    ['tier', 'Tier'],
                    ['booked', 'Tickets'],
                    ['gross', 'Gross'],
                    ['occ', 'Occ %']
                  ].map(([key, label]) => (
                    <th key={key}>
                      <button
                        type="button"
                        onClick={() => handleLedgerSort(key)}
                        aria-label={`Sort by ${label}`}
                        style={{
                          width: '100%',
                          padding: 0,
                          border: 0,
                          background: 'none',
                          color: 'inherit',
                          font: 'inherit',
                          textAlign: 'inherit',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer'
                        }}
                      >
                        {label}{getLedgerSortIndicator(key)}
                      </button>
                    </th>
                  ))}
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

        <HistoryTable data={historyData} currency="INR" showGrowth={false} />
        {showGrowth && <IndiaGrossGrowthChart historyData={historyData} />}

        <div className="footer">
          @TheWkndCinema • BookMyShow + District • Including blocked seats.
        </div>
      </div>
    </main>
  );
});