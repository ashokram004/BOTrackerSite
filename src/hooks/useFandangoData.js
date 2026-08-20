import { useState, useEffect, useRef, useCallback } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebaseConfig';

const DEFAULT_MOVIE_SLUG = 'peddi-2026';
const DEFAULT_SHOW_DATE = '2026-06-03';
const DEFAULT_REGION = 'usa';
const sessionDashboardCache = new Map();

window.addEventListener('pagehide', () => {
  sessionDashboardCache.clear();
});

const getMovieRootCandidates = (region) => {
  const normalized = String(region || '').toLowerCase();
  if (normalized === 'india') {
    return ['India/movies'];
  }
  return ['movies'];
};

const getMovieDateCandidates = (region, movieSlug) => {
  if (!movieSlug) return [];
  return getMovieRootCandidates(region).map((root) => `${root}/${movieSlug}`);
};

const formatUtcToIst = (value) => {
  try {
    if (value === null || value === undefined || value === '') return 'N/A';
    const ms = typeof value === 'number' ? value : Date.parse(String(value));
    if (!Number.isFinite(ms)) return 'N/A';
    return new Date(ms).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).replace(/am|pm/i, match => match.toUpperCase());
  } catch {
    return 'N/A';
  }
};

const normalizeFirebasePayload = (value) => {
  if (!value) return { data: [] };
  if (Array.isArray(value)) return { data: value };
  if (value.data && (Array.isArray(value.data) || typeof value.data === 'object')) return value;
  if (value.master_shows_data || value.last_snapshot || value.previous_run_snapshot || value.history) return value;
  if (typeof value === 'object') return { data: Object.values(value) };
  return { data: [] };
};

const getSourceType = (row = {}) => {
  const bSid = row.bms_sid || row.bmsId || row.bms_sid;
  const dSid = row.district_sid || row.districtId || row.district_sid;
  if (bSid && dSid) return 'Merged';
  if (bSid && !dSid) return 'BookMyShow';
  if (!bSid && dSid) return 'District';
  return 'Unknown';
};

const getOccTier = (occ = 0) => {
  const value = Number(occ) || 0;
  if (value >= 100) return 'Sold Out';
  if (value >= 80) return 'Almost Full';
  if (value >= 50) return 'Fast Filling';
  return 'Available';
};

const getTimeCategory = (timeValue) => {
  const raw = String(timeValue || '').trim();
  if (!raw) return '7. Unknown Time';

  try {
    const parsed = raw.includes(' ') ? raw : `${raw}`;
    const match = parsed.match(/(\d{1,2}):(\d{2})/);
    if (!match) return '7. Unknown Time';

    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const clean = raw.toLowerCase();
    const isPm = clean.includes('pm');
    const isAm = clean.includes('am');

    if (isPm && hour !== 12) hour += 12;
    if (isAm && hour === 12) hour = 0;

    if (minute === 0 && hour === 0 && !isPm && !isAm) {
      return '6. Midnight (12am-5am)';
    }

    if (hour >= 5 && hour < 9) return '1. Early Morning (5am-9am)';
    if (hour >= 9 && hour < 12) return '2. Morning (9am-12pm)';
    if (hour >= 12 && hour < 16) return '3. Afternoon (12pm-4pm)';
    if (hour >= 16 && hour < 20) return '4. Evening (4pm-8pm)';
    if (hour >= 20 && hour < 24) return '5. Night (8pm-12am)';
    return '6. Midnight (12am-5am)';
  } catch {
    return '7. Unknown Time';
  }
};

const normalizeIndiaRow = (row = {}) => {
  const rawTime = row.normalized_show_time || row.show_time || row.time || row.showTime || 'Unknown';
  const formattedTime = (() => {
    if (!rawTime || rawTime === 'Unknown') return 'Unknown';
    try {
      const dt = new Date(rawTime);
      if (!Number.isNaN(dt.getTime())) {
        return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }
      return String(rawTime);
    } catch {
      return String(rawTime);
    }
  })();

  const total = Number(row.total_tickets ?? row.total ?? row.totalTickets ?? row.capacity ?? 0);
  const booked = Number(row.booked_tickets ?? row.booked ?? row.bookedTickets ?? 0);
  const gross = Number(row.booked_gross ?? row.gross ?? row.total_gross ?? row.grossValue ?? 0);
  const occupancy = Number(row.occupancy ?? (total > 0 ? (booked / total) * 100 : 0));

  return {
    id: row.id || `${row.venue || 'venue'}_${row.format || 'format'}_${formattedTime}_${row.language || 'lang'}`,
    state: row.state || row.State || 'Unknown',
    city: row.city || row.City || 'Unknown',
    theater: row.venue || row.theater || row.theatre || row.venue_name || 'Unknown',
    format: row.format || row.screen_format || '2D',
    language: row.language || row.lang || 'Unknown',
    time: formattedTime,
    timeCat: getTimeCategory(rawTime),
    occTier: getOccTier(occupancy),
    sourceType: getSourceType(row),
    total,
    booked,
    gross,
    occ: occupancy,
    status: getOccTier(occupancy),
    price_str: row.price || row.ticket_price || '₹0',
    chain: row.sourceType || getSourceType(row),
    theaterName: row.venue || row.theater || row.theatre || row.venue_name || 'Unknown',
    has_snapshot: true,
    s_gross: 0,
    s_booked: 0,
    s_total: 0
  };
};

const buildIndiaDashboard = (payload) => {
  const rows = Object.values(payload || {})
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      if (Array.isArray(entry)) return entry.map(normalizeIndiaRow);
      if (entry.state || entry.city || entry.venue || entry.theater || entry.normalized_show_time || entry.booked_gross || entry.total_tickets || entry.booked_tickets) {
        return [normalizeIndiaRow(entry)];
      }
      return Object.values(entry)
        .filter((nested) => nested && typeof nested === 'object')
        .map(normalizeIndiaRow);
    })
    .filter(Boolean);

  const summary = {
    formats: {},
    languages: {},
    states: {},
    theaters: {},
    chains: {},
    timeCats: {}
  };

  const addSummary = (map, key, row) => {
    if (!map[key]) {
      map[key] = { id: key, name: key, shows: 0, tickets: 0, booked: 0, gross: 0, d_booked: 0, d_gross: 0, d_tickets: 0, occ: 0 };
    }
    map[key].shows += 1;
    map[key].tickets += row.total || 0;
    map[key].booked += row.booked || 0;
    map[key].gross += row.gross || 0;
    map[key].occ = map[key].tickets > 0 ? (map[key].booked / map[key].tickets) * 100 : 0;
  };

  rows.forEach((row) => {
    addSummary(summary.formats, row.format || 'Unknown', row);
    addSummary(summary.languages, row.language || 'Unknown', row);
    addSummary(summary.states, row.state || 'Unknown', row);
    addSummary(summary.theaters, row.theater || 'Unknown', row);
    addSummary(summary.chains, row.sourceType || 'Unknown', row);
    addSummary(summary.timeCats, row.timeCat || 'Unknown', row);
  });

  const kpis = {
    totalGross: { val: rows.reduce((sum, row) => sum + (Number(row.gross) || 0), 0), delta: 0 },
    totalTickets: { val: rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0), delta: 0 },
    totalBooked: { val: rows.reduce((sum, row) => sum + (Number(row.booked) || 0), 0), delta: 0 },
    totalVenues: { val: new Set(rows.map((row) => row.theater || 'Unknown')).size, delta: 0 },
    totalShows: { val: rows.length, delta: 0 },
    occupancy: { val: rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0) > 0
      ? (rows.reduce((sum, row) => sum + (Number(row.booked) || 0), 0) / rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0)) * 100
      : 0, capacity: rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0) }
  };

  const tables = {
    formats: Object.values(summary.formats).sort((a, b) => b.gross - a.gross),
    languages: Object.values(summary.languages).sort((a, b) => b.gross - a.gross),
    states: Object.values(summary.states).sort((a, b) => b.gross - a.gross),
    theaters: Object.values(summary.theaters).sort((a, b) => b.gross - a.gross),
    chains: Object.values(summary.chains).sort((a, b) => b.gross - a.gross),
    timeCats: Object.values(summary.timeCats).sort((a, b) => b.gross - a.gross)
  };

  return {
    loading: false,
    kpis,
    tables,
    rawRows: rows,
    historyData: [],
    filteredKpis: null,
    metadata: {
      lastUpdated: 'N/A',
      growthSince: 'N/A',
      showDate
    },
    error: null,
    differences: null
  };
};

export const useFandangoData = (diffModeOrOptions = 'daily', maybeOptions = {}) => {
  const usesLegacyArguments = typeof diffModeOrOptions === 'string';
  const options = usesLegacyArguments
    ? { diffMode: diffModeOrOptions, ...maybeOptions }
    : { diffMode: 'daily', ...diffModeOrOptions };

  const diffMode = options.diffMode || 'daily';
  const region = options.region || DEFAULT_REGION;
  const movieSlug = options.movieSlug || (usesLegacyArguments ? DEFAULT_MOVIE_SLUG : '');
  const showDate = options.showDate || (usesLegacyArguments ? DEFAULT_SHOW_DATE : '');
  const enabled = options.enabled !== undefined ? options.enabled : true;
  const includeDifferences = options.includeDifferences !== undefined ? options.includeDifferences : region !== 'india';
  const refreshKey = options.refreshKey || 0;

  const [data, setData] = useState({
    loading: true,
    kpis: null,
    tables: null,
    rawRows: [],
    historyData: [],
    filteredKpis: null,
    metadata: null,
    error: null,
    differences: null
  });

  const refs = useRef({
    currentData: null,
    dailySnapshot: null,
    hourlySnapshot: null,
    historyDataRaw: null,
    lastUpdated: 'N/A',
    growthSinceDaily: 'N/A',
    growthSinceHourly: 'N/A'
  });
  const requestIdRef = useRef(0);

  const process = useCallback(() => {
    if (!enabled) return;

    const { currentData, dailySnapshot, hourlySnapshot, historyDataRaw, lastUpdated, growthSinceDaily, growthSinceHourly } = refs.current;

    const isIndia = String(region).toLowerCase() === 'india';

    if (!isIndia && !currentData) return;

    if (isIndia) {
      const indiaPayload = normalizeFirebasePayload(currentData || dailySnapshot || hourlySnapshot || {});
      const indiaRows = Object.values(indiaPayload.data || indiaPayload || {})
        .flatMap((entry) => {
          if (!entry || typeof entry !== 'object') return [];
          if (Array.isArray(entry)) return entry.map(normalizeIndiaRow);
          if (entry.state || entry.city || entry.venue || entry.theater || entry.normalized_show_time || entry.booked_gross || entry.total_tickets || entry.booked_tickets) {
            return [normalizeIndiaRow(entry)];
          }
          return Object.values(entry)
            .filter((nested) => nested && typeof nested === 'object')
            .map(normalizeIndiaRow);
        })
        .filter(Boolean);

      if (!indiaRows.length) {
        setData({
          loading: false,
          kpis: null,
          tables: null,
          rawRows: [],
          historyData: [],
          filteredKpis: null,
          metadata: null,
          error: null,
          differences: null
        });
        return;
      }

      const summary = { formats: {}, languages: {}, states: {}, theaters: {}, chains: {}, timeCats: {} };
      const addSummary = (map, key, row) => {
        if (!map[key]) {
          map[key] = { id: key, name: key, shows: 0, tickets: 0, booked: 0, gross: 0, d_booked: 0, d_gross: 0, d_tickets: 0, occ: 0 };
        }
        map[key].shows += 1;
        map[key].tickets += Number(row.total || 0);
        map[key].booked += Number(row.booked || 0);
        map[key].gross += Number(row.gross || 0);
        map[key].occ = map[key].tickets > 0 ? (map[key].booked / map[key].tickets) * 100 : 0;
      };

      indiaRows.forEach((row) => {
        addSummary(summary.formats, row.format || 'Unknown', row);
        addSummary(summary.languages, row.language || 'Unknown', row);
        addSummary(summary.states, row.state || 'Unknown', row);
        addSummary(summary.theaters, row.theater || 'Unknown', row);
        addSummary(summary.chains, row.sourceType || 'Unknown', row);
        addSummary(summary.timeCats, row.timeCat || 'Unknown', row);
      });

      const totalTickets = indiaRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
      const totalBooked = indiaRows.reduce((sum, row) => sum + (Number(row.booked) || 0), 0);
      const totalGross = indiaRows.reduce((sum, row) => sum + (Number(row.gross) || 0), 0);

      setData({
        loading: false,
        kpis: {
          totalGross: { val: totalGross, delta: 0 },
          totalTickets: { val: totalTickets, delta: 0 },
          totalBooked: { val: totalBooked, delta: 0 },
          totalVenues: { val: new Set(indiaRows.map((row) => row.theater || 'Unknown')).size, delta: 0 },
          totalShows: { val: indiaRows.length, delta: 0 },
          occupancy: { val: totalTickets > 0 ? (totalBooked / totalTickets) * 100 : 0, capacity: totalTickets }
        },
        tables: {
          formats: Object.values(summary.formats).sort((a, b) => b.gross - a.gross),
          languages: Object.values(summary.languages).sort((a, b) => b.gross - a.gross),
          states: Object.values(summary.states).sort((a, b) => b.gross - a.gross),
          theaters: Object.values(summary.theaters).sort((a, b) => b.gross - a.gross),
          chains: Object.values(summary.chains).sort((a, b) => b.gross - a.gross),
          timeCats: Object.values(summary.timeCats).sort((a, b) => b.gross - a.gross)
        },
        rawRows: indiaRows,
        historyData: [],
        filteredKpis: {
          totalTickets,
          totalBooked,
          totalGross,
          shows: indiaRows.length,
          venues: new Set(indiaRows.map((row) => row.theater || 'Unknown')).size,
          occupancy: totalTickets > 0 ? (totalBooked / totalTickets) * 100 : 0
        },
        metadata: {
          lastUpdated: 'N/A',
          growthSince: 'N/A',
          showDate
        },
        error: null,
        differences: null
      });
      return;
    }

    const safeCurrentData = normalizeFirebasePayload(currentData);
    const safeDailySnapshot = normalizeFirebasePayload(dailySnapshot || safeCurrentData);
    const safeHourlySnapshot = normalizeFirebasePayload(hourlySnapshot || safeCurrentData);

    const currentDiffMode = diffMode;
    const snapshotData = currentDiffMode === 'hourly' ? safeHourlySnapshot : safeDailySnapshot;

    if (!safeCurrentData || !snapshotData) return;

    let growthSince = currentDiffMode === 'hourly' ? growthSinceHourly : growthSinceDaily;

    const toArray = (value) => {
      if (Array.isArray(value)) return value;
      if (!value) return [];
      return Object.values(value);
    };

    const normalizeNumber = (value) => {
      if (typeof value === 'string') {
        const parsed = parseFloat(value.replace(/[^0-9.-]+/g, ""));
        return Number.isFinite(parsed) ? parsed : 0;
      }
      const normalized = Number(value);
      return Number.isFinite(normalized) ? normalized : 0;
    };

    const rawCurrent = toArray(safeCurrentData.data || safeCurrentData);
    const rawSnapshot = toArray(snapshotData.data || snapshotData);

    const getChainCategory = (theaterName) => {
      const name = (theaterName || '').toUpperCase();
      if (name.includes('AMC')) return 'AMC Theatres';
      if (name.includes('CINEMARK') || name.includes('CENTURY')) return 'Cinemark';
      if (name.includes('REGAL')) return 'Regal Cinemas';
      if (name.includes('MARCUS')) return 'Marcus Theatres';
      if (name.includes('HARKINS')) return 'Harkins Theatres';
      if (name.includes('APPLE CINEMAS')) return 'Apple Cinemas';
      return 'Other / Independents';
    };

    const getTimeCategory = (timeStr) => {
      try {
        const clean = (timeStr || 'Unknown').trim();
        const cleanTime = clean.replace(/\s*o'clock\s*/gi, ':00 ');
        const t = new Date(`2000-01-01T${cleanTime}`);
        const hours = Number.isFinite(t.getTime()) ? t.getHours() : null;
        if (hours === null) {
          const m = cleanTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
          if (!m) return '7. Unknown Time';
          let h = parseInt(m[1], 10);
          const ampm = m[3].toUpperCase();
          if (ampm === 'PM' && h !== 12) h += 12;
          if (ampm === 'AM' && h === 12) h = 0;
          if (h >= 5 && h < 9) return '1. Early Morning (5am-9am)';
          if (h >= 9 && h < 12) return '2. Morning (9am-12pm)';
          if (h >= 12 && h < 16) return '3. Afternoon (12pm-4pm)';
          if (h >= 16 && h < 20) return '4. Evening (4pm-8pm)';
          if (h >= 20 && h < 24) return '5. Night (8pm-12am)';
          return '6. Midnight (12am-5am)';
        }
        if (hours >= 5 && hours < 9) return '1. Early Morning (5am-9am)';
        if (hours >= 9 && hours < 12) return '2. Morning (9am-12pm)';
        if (hours >= 12 && hours < 16) return '3. Afternoon (12pm-4pm)';
        if (hours >= 16 && hours < 20) return '4. Evening (4pm-8pm)';
        if (hours >= 20 && hours < 24) return '5. Night (8pm-12am)';
        return '6. Midnight (12am-5am)';
      } catch {
        return '7. Unknown Time';
      }
    };

    const normalizeFormat = (fmt) => {
      const f = fmt || 'Standard';
      return f?.includes('D-Box') && f?.includes('Premium') ? 'Premium' : f;
    };

    const parseTimeForSort = (timeStr) => {
      if (!timeStr) return 0;
      const clean = timeStr.toString().trim().toLowerCase().replace(/\s*o'clock\s*/gi, ':00 ');
      const m = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
      if (!m) return 0;
      let h = parseInt(m[1], 10);
      let min = parseInt(m[2] || '0', 10);
      let ampm = m[3];
      if (ampm === 'pm' && h !== 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      return h * 60 + min;
    };

    const makeBaseId = (r) => {
      const theater = (r.t_id || r.theater || r['Theater Name'] || r['Theater'] || '').trim().toLowerCase();
      const format = (normalizeFormat(r.format || r['Format']) || '').trim().toLowerCase();
      const language = (r.language || r['Language'] || '').trim().toLowerCase();
      return `${theater}_${format}_${language}`;
    };

    const makeRowId = (r) => {
      const time = (r.time || r['Show Time'] || r['Time'] || '').trim().toLowerCase();
      return `${makeBaseId(r)}_${time}`;
    };

    const snapMap = new Map();
    rawSnapshot.forEach((r, i) => {
      if (r.is_extra || r.t_id === 'EXTRA') return;
      r._matched = false;
      const id = makeRowId(r);
      if (!snapMap.has(id)) snapMap.set(id, []);
      snapMap.get(id).push(r);
    });

    const currentMatchedSnap = new Map();
    const unmatchedCurrent = [];

    rawCurrent.forEach((r, i) => {
      if (r.is_extra || r.t_id === 'EXTRA') return;
      const id = makeRowId(r);
      const potentialSnaps = snapMap.get(id);

      if (potentialSnaps && potentialSnaps.length > 0) {
        const sMatch = potentialSnaps.find(s => !s._matched);
        if (sMatch) {
          sMatch._matched = true;
          currentMatchedSnap.set(i, sMatch);
        } else {
          unmatchedCurrent.push({ row: r, index: i });
        }
      } else {
        unmatchedCurrent.push({ row: r, index: i });
      }
    });

    const unmatchedSnapByBase = {};
    rawSnapshot.forEach(s => {
      if (s.is_extra || s.t_id === 'EXTRA' || s._matched) return;
      const baseId = makeBaseId(s);
      if (!unmatchedSnapByBase[baseId]) unmatchedSnapByBase[baseId] = [];
      unmatchedSnapByBase[baseId].push(s);
    });

    unmatchedCurrent.forEach(({ row: c, index: i }) => {
      const baseId = makeBaseId(c);
      const cMins = parseTimeForSort(c.time || c['Show Time'] || c['Time']);
      const availableSnaps = unmatchedSnapByBase[baseId] || [];

      let bestMatch = null;
      let minDiff = Infinity;

      availableSnaps.forEach(s => {
        if (s._matched) return;
        const sMins = parseTimeForSort(s.time || s['Show Time'] || s['Time']);
        const diff = Math.abs(cMins - sMins);
        if (diff <= 60 && diff < minDiff) {
          minDiff = diff;
          bestMatch = s;
        }
      });

      if (bestMatch) {
        bestMatch._matched = true;
        currentMatchedSnap.set(i, bestMatch);
      }
    });

    const differences = {
      addedShows: [],
      removedShows: [],
      ticketsBooked: [],
      ticketsCancelled: []
    };

    rawCurrent.forEach((r, idx) => {
      if (r.is_extra || r.t_id === 'EXTRA') return;
      const sRow = currentMatchedSnap.get(idx);
      const currBooked = normalizeNumber(r.booked);
      const currGross = normalizeNumber(r.gross);
      const theaterName = r.theater || r['Theater Name'] || r['Theater'];

      if (!sRow) {
        differences.addedShows.push({ ...r, theater: theaterName });
      } else {
        const snapBooked = normalizeNumber(sRow.booked !== undefined ? sRow.booked : sRow['Booked']);
        const snapGross = normalizeNumber(sRow.gross !== undefined ? sRow.gross : (sRow['Gross ($)'] !== undefined ? sRow['Gross ($)'] : sRow['Gross']));
        const diffBooked = currBooked - snapBooked;
        const diffGross = currGross - snapGross;
        
        if (diffBooked > 0) {
          differences.ticketsBooked.push({ ...r, theater: theaterName, diffBooked, diffGross });
        } else if (diffBooked < 0) {
          differences.ticketsCancelled.push({ ...r, theater: theaterName, diffBooked: Math.abs(diffBooked), diffGross: Math.abs(diffGross) });
        }
      }
    });

    rawSnapshot.forEach(r => {
      if (r.is_extra || r.t_id === 'EXTRA') return;
      if (!r._matched) {
        const theaterName = r.theater || r['Theater Name'] || r['Theater'];
        differences.removedShows.push({ ...r, theater: theaterName, time: r.time || r['Show Time'] || r['Time'], format: r.format || r['Format'], language: r.language || r['Language'] });
      }
    });

    differences.addedShows.sort((a, b) => normalizeNumber(b.gross) - normalizeNumber(a.gross));
    differences.removedShows.sort((a, b) => normalizeNumber(b.gross || b['Gross ($)'] || b['Gross']) - normalizeNumber(a.gross || a['Gross ($)'] || a['Gross']));
    differences.ticketsBooked.sort((a, b) => b.diffBooked - a.diffBooked);
    differences.ticketsCancelled.sort((a, b) => b.diffBooked - a.diffBooked);

    const aggregate = (dataset) => {
      let totalGross = 0;
      let totalTickets = 0;
      let totalBooked = 0;
      
      let validGross = 0;
      let validTickets = 0;
      let validBooked = 0;

      let validShows = 0;
      let validVenues = new Set();
      let validCapacity = 0;

      const summary = {
        formats: {},
        languages: {},
        states: {},
        theaters: {},
        chains: {},
        timeCats: {}
      };

      dataset.forEach(row => {
        const gross = normalizeNumber(row.gross !== undefined ? row.gross : (row['Gross ($)'] !== undefined ? row['Gross ($)'] : row['Gross']));
        const booked = normalizeNumber(row.booked !== undefined ? row.booked : row['Booked']);
        const tickets = normalizeNumber(row.total !== undefined ? row.total : (row['Tickets'] !== undefined ? row['Tickets'] : row['Capacity']));
        const isExtra = row.is_extra || row.t_id === 'EXTRA';

        totalGross += gross;
        totalTickets += tickets;
        totalBooked += booked;

        if (!isExtra) {
          validGross += gross;
          validTickets += tickets;
          validBooked += booked;

          validShows += 1;
          const theaterName = row.theater || row['Theater Name'] || row['Theater'] || 'Unknown';
          const tId = row.t_id || theaterName;
          validVenues.add(tId);
          validCapacity += tickets;

          const rawFormat = row.format || row['Format'] || '';
          const format = rawFormat.includes('D-Box') && rawFormat.includes('Premium') ? 'Premium' : (rawFormat || 'Unknown');
          const lang = row.language || row['Language'] || 'Unknown';
          const state = row.state || row['State'] || 'Unknown';
          
          const chain = getChainCategory(theaterName);
          const timeCat = getTimeCategory(row.time || row['Show Time'] || row['Time'] || 'Unknown');

          const inc = (obj, key, nameFallback) => {
            if (!obj[key]) obj[key] = { id: key, name: nameFallback || key, shows: 0, tickets: 0, booked: 0, gross: 0, d_booked: 0, d_gross: 0, d_tickets: 0 };
            obj[key].shows += 1;
            obj[key].tickets += tickets;
            obj[key].booked += booked;
            obj[key].gross += gross;
          };

          inc(summary.formats, format);
          inc(summary.languages, lang);
          inc(summary.states, state);
          inc(summary.theaters, tId, theaterName);
          inc(summary.chains, chain);
          inc(summary.timeCats, timeCat);
        } else {
          const lang = 'Telugu';
          if (!summary.languages[lang]) {
            summary.languages[lang] = { id: lang, name: lang, shows: 0, tickets: 0, booked: 0, gross: 0, d_booked: 0, d_gross: 0, d_tickets: 0 };
          }
          summary.languages[lang].tickets += tickets;
          summary.languages[lang].booked += booked;
          summary.languages[lang].gross += gross;
        }
      });

      return {
        totalGross, 
        totalTickets, 
        totalBooked,
        validGross, 
        validTickets, 
        validBooked,
        totalShows: validShows,
        totalVenues: validVenues.size,
        occupancy: validCapacity > 0 ? (validBooked / validCapacity) * 100 : 0,
        totalCapacity: validCapacity,
        summary
      };
    };

    const curr = aggregate(rawCurrent);
    const snap = aggregate(rawSnapshot, true);

    const getSnapshotItem = (item, snapDict, isTheater) => {
      if (!snapDict) return null;
      if (isTheater) {
        let sItem = Object.values(snapDict).find((x) => x.id === item.id);
        if (!sItem) sItem = Object.values(snapDict).find((x) => x.name?.toString().toLowerCase() === item.name?.toString().toLowerCase());
        return sItem || null;
      }
      if (snapDict[item.name]) return snapDict[item.name];
      return Object.values(snapDict).find((x) => x.name?.toString().toLowerCase() === item.name?.toString().toLowerCase()) || null;
    };

    const kpis = {
      totalGross: { val: curr.totalGross, delta: curr.validGross - snap.validGross },
      totalTickets: { val: curr.totalTickets, delta: curr.validTickets - snap.validTickets },
      totalBooked: { val: curr.totalBooked, delta: curr.validBooked - snap.validBooked },
      totalVenues: { val: curr.totalVenues, delta: curr.totalVenues - snap.totalVenues },
      totalShows: { val: curr.totalShows, delta: curr.totalShows - snap.totalShows },
      occupancy: { val: curr.occupancy, capacity: curr.totalCapacity }
    };

    const rawRows = rawCurrent.map((row, idx) => {
      const format = normalizeFormat(row.format);
      const state = row.state || 'Unknown';
      const theater = row.theater || 'Unknown';
      const chain = getChainCategory(theater);
      const time = row.time || 'Unknown';
      const timeCat = getTimeCategory(time);

      const total = normalizeNumber(row.total);
      const booked = normalizeNumber(row.booked);
      const gross = normalizeNumber(row.gross);

      const occ = total > 0 ? (booked / total) * 100 : 0;

      const status = row.status || 'Available';
      const price_str = row.price_str || '$0.00';
      const language = row.language || 'Unknown';
      const is_extra = !!(row.is_extra || row.t_id === 'EXTRA');

      const sRow = currentMatchedSnap.get(idx);
      
      const s_gross = sRow ? normalizeNumber(sRow.gross !== undefined ? sRow.gross : (sRow['Gross ($)'] !== undefined ? sRow['Gross ($)'] : sRow['Gross'])) : 0;
      const s_booked = sRow ? normalizeNumber(sRow.booked !== undefined ? sRow.booked : sRow['Booked']) : 0;
      const s_total = sRow ? normalizeNumber(sRow.total !== undefined ? sRow.total : (sRow['Tickets'] !== undefined ? sRow['Tickets'] : sRow['Capacity'])) : 0;

      return {
        t_id: row.t_id || '',
        id: `${row.t_id || ''}_${row.time || ''}_${format || ''}_${language || ''}_${theater || ''}_${idx}`,
        state,
        theater,
        format,
        language,
        time,
        timeCat,
        chain,
        status,
        price_str,
        total,
        booked,
        gross,
        occ,
        is_extra,
        has_snapshot: !!sRow,
        s_gross,
        s_booked,
        s_total,
        // ✅ BUG FIXED: Explicitly added seat_map_urls mapping here so frontend can access it
        seat_map_urls: row.seat_map_urls || '' 
      };
    });

    const buildTable = (currDict, snapDict, isTheater = false) => {
      const result = Object.values(currDict).map((item) => {
        const sItem = getSnapshotItem(item, snapDict, isTheater);
        const s_gross = normalizeNumber(sItem?.gross);
        const s_booked = normalizeNumber(sItem?.booked);
        const s_tickets = normalizeNumber(sItem?.tickets);

        const d_gross = normalizeNumber(item.gross) - s_gross;
        const d_booked = normalizeNumber(item.booked) - s_booked;
        const d_tickets = normalizeNumber(item.tickets) - s_tickets;
        const occ = normalizeNumber(item.tickets) > 0 ? (normalizeNumber(item.booked) / normalizeNumber(item.tickets)) * 100 : 0;
        return { ...item, d_gross, d_booked, d_tickets, occ };
      });

      if (snapDict) {
        Object.values(snapDict).forEach(sItem => {
          const exists = result.find(r => r.id === sItem.id || r.name === sItem.name);
          if (!exists) {
            result.push({
              id: sItem.id,
              name: sItem.name,
              shows: 0,
              tickets: 0,
              booked: 0,
              gross: 0,
              d_gross: -normalizeNumber(sItem.gross),
              d_booked: -normalizeNumber(sItem.booked),
              d_tickets: -normalizeNumber(sItem.tickets),
              occ: 0
            });
          }
        });
      }

      return result.sort((a, b) => b.gross - a.gross);
    };

    const tables = {
      formats: buildTable(curr.summary.formats, snap.summary.formats),
      languages: buildTable(curr.summary.languages, snap.summary.languages),
      states: buildTable(curr.summary.states, snap.summary.states),
      theaters: buildTable(curr.summary.theaters, snap.summary.theaters, true),
      chains: buildTable(curr.summary.chains, snap.summary.chains),
      timeCats: buildTable(curr.summary.timeCats, snap.summary.timeCats)
    };

    const filteredRowsBase = rawRows.filter((r) => !r.is_extra);
    const computeFilteredKpis = (rows) => {
      const totalTickets = rows.reduce((s, r) => s + (r.total || 0), 0);
      const totalBooked = rows.reduce((s, r) => s + (r.booked || 0), 0);
      const totalGross = rows.reduce((s, r) => s + (r.gross || 0), 0);
      const venues = new Set(rows.map((r) => r.t_id || r.theater).filter(Boolean));
      const occupancy = totalTickets > 0 ? (totalBooked / totalTickets) * 100 : 0;
      return {
        totalTickets,
        totalBooked,
        totalGross,
        shows: rows.length,
        venues: venues.size,
        occupancy
      };
    };

    const initialFilteredKpis = computeFilteredKpis(filteredRowsBase);

    function formatDate(dateObj) {
      if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return 'N/A';
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const formattedDay = dateObj.getDate();
      const formattedMonth = months[dateObj.getMonth()];
      const formattedYear = dateObj.getFullYear();
      let displayHours = dateObj.getHours();
      const displayMinutes = String(dateObj.getMinutes()).padStart(2, "0");
      const displaySeconds = String(dateObj.getSeconds()).padStart(2, "0");
      const ampm = displayHours >= 12 ? "PM" : "AM";
      displayHours = displayHours % 12 || 12;
      return `${formattedDay} ${formattedMonth} ${formattedYear}, ${displayHours}:${displayMinutes}:${displaySeconds} ${ampm}`;
    }

    const nextData = {
      loading: false,
      kpis,
      tables,
      rawRows,
      historyData: historyDataRaw || [],
      filteredKpis: initialFilteredKpis,
      differences,
      metadata: {
        lastUpdated: formatDate(lastUpdated),
        growthSince: growthSince,
        showDate,
        movieSlug
      },
      error: null
    };

    sessionDashboardCache.set(`${region}/${movieSlug}/${showDate}/${diffMode}`, nextData);
    setData(nextData);

  }, [diffMode, enabled, movieSlug, region, showDate]);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!enabled) {
      refs.current = {
        currentData: null,
        dailySnapshot: null,
        hourlySnapshot: null,
        historyDataRaw: null,
        lastUpdated: 'N/A',
        growthSinceDaily: 'N/A',
        growthSinceHourly: 'N/A'
      };
      setData({
        loading: false,
        kpis: null,
        tables: null,
        rawRows: [],
        historyData: [],
        filteredKpis: null,
        metadata: null,
        error: null,
        differences: null
      });
      return undefined;
    }

    refs.current = {
      currentData: null,
      dailySnapshot: null,
      hourlySnapshot: null,
      historyDataRaw: null,
      lastUpdated: 'N/A',
      growthSinceDaily: 'N/A',
      growthSinceHourly: 'N/A'
    };

    const cacheKey = `${region}/${movieSlug}/${showDate}/${diffMode}`;
    if (refreshKey > 0) sessionDashboardCache.delete(cacheKey);
    if (sessionDashboardCache.has(cacheKey)) {
      const cachedData = sessionDashboardCache.get(cacheKey);
      let timerId;
      const frameId = requestAnimationFrame(() => {
        timerId = setTimeout(() => {
          if (requestIdRef.current === requestId) setData(cachedData);
        }, 0);
      });
      return () => {
        if (requestIdRef.current === requestId) requestIdRef.current += 1;
        cancelAnimationFrame(frameId);
        clearTimeout(timerId);
      };
    }

    const paths = getMovieDateCandidates(region, movieSlug);
    const validPaths = paths.filter(Boolean);
    const unsubscribes = [];

    const attachListener = (pathPrefix) => {
      const isIndia = String(region).toLowerCase() === 'india';
      const currentRef = isIndia
        ? ref(database, `${pathPrefix}/${showDate}`)
        : ref(database, `${pathPrefix}/${showDate}/master_shows_data`);
      const snapshotRef = isIndia ? null : ref(database, `${pathPrefix}/${showDate}/last_snapshot`);
      const hourlySnapshotRef = isIndia ? null : ref(database, `${pathPrefix}/${showDate}/previous_run_snapshot`);
      const historyRef = isIndia ? null : ref(database, `${pathPrefix}/${showDate}/history`);

      const unsubCurrent = onValue(currentRef, (snapshot) => {
        if (requestIdRef.current !== requestId) return;
        if (!snapshot.exists()) return;
        const payload = normalizeFirebasePayload(snapshot.val());
        if (!payload || (!payload.data && !payload.master_shows_data && !payload.last_snapshot)) return;

        refs.current.currentData = payload;
        if (refs.current.currentData.last_updated) {
            refs.current.lastUpdated = new Date(refs.current.currentData.last_updated);
        }
        process();
      }, (error) => {
          if (requestIdRef.current !== requestId) return;
          setData(prev => ({ ...prev, loading: false, error: error.message }));
      });

      unsubscribes.push(unsubCurrent);

      if (isIndia) return;

      const unsubSnapshot = onValue(snapshotRef, (snapshot) => {
        if (requestIdRef.current !== requestId) return;
        if (!snapshot.exists()) return;
        const payload = normalizeFirebasePayload(snapshot.val());
        if (!payload || (!payload.data && !payload.last_snapshot)) return;

        refs.current.dailySnapshot = payload;
        if (refs.current.dailySnapshot?.timestamp) {
          refs.current.growthSinceDaily = formatUtcToIst(refs.current.dailySnapshot.timestamp);
        }
        process();
      });

      const unsubHourlySnapshot = onValue(hourlySnapshotRef, (snapshot) => {
        if (requestIdRef.current !== requestId) return;
        if (!snapshot.exists()) return;
        const payload = normalizeFirebasePayload(snapshot.val());
        if (!payload || (!payload.data && !payload.previous_run_snapshot)) return;

        refs.current.hourlySnapshot = payload;
        if (refs.current.hourlySnapshot?.timestamp) {
          refs.current.growthSinceHourly = formatUtcToIst(refs.current.hourlySnapshot.timestamp);
        }
        process();
      });

      const unsubHistory = onValue(historyRef, (snapshot) => {
        if (requestIdRef.current !== requestId) return;
        if (!snapshot.exists()) return;
        const hData = snapshot.val();
        if (!hData) return;

        refs.current.historyDataRaw = Object.values(hData).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        process();
      });

      unsubscribes.push(unsubSnapshot, unsubHourlySnapshot, unsubHistory);
    };

    validPaths.forEach((pathPrefix) => attachListener(pathPrefix));

    return () => {
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [enabled, movieSlug, process, region, showDate, refreshKey]);

  useEffect(() => {
    if (!enabled) return;
    process();
  }, [diffMode, enabled, process, refreshKey]);

  return {
    ...data,
    region,
    movieSlug,
    showDate,
    includeDifferences
  };
};