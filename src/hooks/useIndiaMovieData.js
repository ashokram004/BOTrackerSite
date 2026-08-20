import { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../firebaseConfig';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const sessionIndiaDashboardCache = new Map();

window.addEventListener('pagehide', () => {
  sessionIndiaDashboardCache.clear();
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
});

const formatTimeValue = (value) => {
  if (!value || value === 'Unknown') return 'Unknown';

  try {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return timeFormatter.format(date);
    }
  } catch {
    // noop
  }

  return String(value);
};

const getTimeCategory = (timeValue) => {
  const raw = String(timeValue || '').trim();
  if (!raw || raw === 'Unknown') return '7. Unknown Time';

  const match = raw.match(/\d{4}-\d{2}-\d{2}\s+(\d{1,2}):(\d{2})/);
  const hourMatch = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  const hour = match ? Number(match[1]) : hourMatch ? Number(hourMatch[1]) : null;
  const ampm = match ? null : (hourMatch?.[3] || '').toLowerCase();
  if (hour === null) return '7. Unknown Time';
  const normalizedHour = (() => {
    let value = hour;
    if (ampm === 'pm' && value !== 12) value += 12;
    if (ampm === 'am' && value === 12) value = 0;
    return value;
  })();

  if (normalizedHour >= 5 && normalizedHour < 9) return 'Early Morning (5am-9am)';
  if (normalizedHour >= 9 && normalizedHour < 12) return 'Morning (9am-12pm)';
  if (normalizedHour >= 12 && normalizedHour < 16) return 'Afternoon (12pm-4pm)';
  if (normalizedHour >= 16 && normalizedHour < 20) return 'Evening (4pm-8pm)';
  if (normalizedHour >= 20 && normalizedHour < 24) return 'Night (8pm-12am)';
  return 'Midnight (12am-5am)';
};

const formatIstDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
};

const getSourceType = (row = {}) => {
  const bmsId = row.bms_sid || row.bmsId || row.bookmyshow_id || row.bookmyshowId || row.sid;
  const districtId = row.district_sid || row.districtId || row.district_id || row.districtId;
  const direct = String(row.sourceType || row.source_type || row.source || '').trim();
  const directLower = direct.toLowerCase();
  const mergeReason = String(row.merge_reason || row.mergeReason || '').trim().toLowerCase();

  if (bmsId && districtId) return 'Merged';
  if (directLower === 'merged' || mergeReason.includes('merge') || mergeReason.includes('exact match')) return 'Merged';
  if (bmsId) return 'BookMyShow';
  if (districtId) return 'District';
  if (directLower === 'bookmyshow' || directLower === 'bms') return 'BookMyShow';
  if (directLower === 'district') return 'District';

  return 'Unknown';
};

const isIndiaRowCandidate = (row = {}) => {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const keyList = ['state', 'city', 'venue', 'theater', 'theatre', 'venue_name', 'normalized_show_time', 'show_time', 'time', 'booked_gross', 'gross', 'total_tickets', 'total', 'booked_tickets', 'booked', 'bms_sid', 'district_sid', 'sourceType', 'source', 'source_type'];
  return Object.keys(row).some((key) => keyList.includes(key) && row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '');
};

const getRowIdentity = (row = {}) => {
  const state = row.state || row.State || '';
  const cityKey = row.city || row.City || row.reporting_city || '';
  const theater = row.venue || row.theater || row.theatre || row.venue_name || '';
  const time = row.normalized_show_time || row.show_time || row.time || row.showTime || '';
  const format = row.format || row.screen_format || '';
  const language = row.language || row.lang || '';
  const source = getSourceType(row);
  const bmsId = row.bms_sid || row.bmsId || row.bookmyshow_id || row.bookmyshowId || row.sid || '';
  const districtId = row.district_sid || row.districtId || row.district_id || row.districtId || '';
  const gross = row.booked_gross ?? row.gross ?? row.total_gross ?? row.grossValue ?? 0;
  const total = row.total_tickets ?? row.total ?? row.totalTickets ?? row.capacity ?? 0;

  return [state, cityKey, theater, format, language, time, source, String(bmsId), String(districtId), String(gross), String(total)].join('|');
};

const normalizeIndiaRow = (row = {}) => {
  const timeValue = row.normalized_show_time || row.show_time || row.time || row.showTime || 'Unknown';
  const total = toNumber(row.total_tickets ?? row.total ?? row.totalTickets ?? row.capacity ?? 0);
  const booked = toNumber(row.booked_tickets ?? row.booked ?? row.bookedTickets ?? 0);
  const gross = toNumber(row.booked_gross ?? row.gross ?? row.total_gross ?? row.grossValue ?? 0);
  const occupancy = toNumber(row.occupancy ?? (total > 0 ? (booked / total) * 100 : 0));
  const sourceType = getSourceType(row);

  return {
    id: row.id || `${row.venue || 'venue'}_${row.format || 'format'}_${timeValue}_${row.language || 'language'}`,
    state: row.state || row.State || 'Unknown',
    city: row.city || row.City || 'Unknown',
    theater: row.venue || row.theater || row.theatre || row.venue_name || 'Unknown',
    format: row.format || row.screen_format || '2D',
    language: row.language || row.lang || 'Unknown',
    time: formatTimeValue(timeValue),
    timeCat: getTimeCategory(timeValue),
    sourceType,
    total,
    booked,
    gross,
    occ: occupancy,
    occTier: occupancy >= 100 ? 'Sold Out' : occupancy >= 80 ? 'Almost Full' : occupancy >= 50 ? 'Fast Filling' : 'Available',
    status: occupancy >= 100 ? 'Sold Out' : occupancy >= 80 ? 'Almost Full' : occupancy >= 50 ? 'Fast Filling' : 'Available',
    price_str: row.price || row.ticket_price || '₹0',
    chain: sourceType,
    source: sourceType,
    lastUpdated: row.last_updated || row.lastUpdated || row.updated_at || row.timestamp || row.timeStamp || null,
    raw: row
  };
};

const flattenIndiaPayload = (value) => {
  if (!value) return [];

  const stack = [value];
  const visited = new WeakSet();
  const rowIdentities = new Set();
  const rows = [];
  let lastUpdated = null;

  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push(current[index]);
      }
      continue;
    }

    if (!lastUpdated) {
      lastUpdated = current.last_updated || current.lastUpdated || current.updated_at || current.updatedAt || current.timestamp || current.timeStamp || current.lastSync || null;
    }

    if (isIndiaRowCandidate(current)) {
      const normalized = normalizeIndiaRow(current);
      const identity = getRowIdentity(current);
      if (!rowIdentities.has(identity)) {
        rowIdentities.add(identity);
        rows.push(normalized);
      }
    }

    const values = Object.values(current);
    for (let index = values.length - 1; index >= 0; index -= 1) {
      const child = values[index];
      if (child && typeof child === 'object' && !visited.has(child)) {
        stack.push(child);
      }
    }
  }

  return {
    rows,
    lastUpdated
  };
};

const getRowsFromPayload = (value) => {
  const flattened = flattenIndiaPayload(value);
  return flattened || { rows: [], lastUpdated: null };
};

export const useIndiaMovieData = ({ enabled, movieSlug, showDate, refreshKey = 0 }) => {
  const [data, setData] = useState({ loading: true, rows: [], error: null, movieName: movieSlug || 'Movie', showDate: showDate || 'N/A', lastUpdated: 'N/A' });

  useEffect(() => {
    if (!enabled || !movieSlug || !showDate) {
      return undefined;
    }

    const candidates = [`India/movies/${movieSlug}/${showDate}/master_shows_data`];
    const cacheKey = `${movieSlug}/${showDate}`;
    let active = true;

    if (refreshKey > 0) sessionIndiaDashboardCache.delete(cacheKey);
    let frameId;
    let timerId;
    if (sessionIndiaDashboardCache.has(cacheKey)) {
      const cachedData = sessionIndiaDashboardCache.get(cacheKey);
      frameId = requestAnimationFrame(() => {
        timerId = setTimeout(() => {
          if (active) setData(cachedData);
        }, 100);
      });
    }

    const finalize = (rows, error = null, lastUpdatedValue = null) => {
      if (!active) return;
      const nextData = {
        loading: false,
        rows: rows || [],
        error,
        movieName: movieSlug,
        showDate,
        lastUpdated: formatIstDate(lastUpdatedValue || 'N/A')
      };
      sessionIndiaDashboardCache.set(cacheKey, nextData);
      setData(nextData);
    };

    const unsubscribe = onValue(ref(database, candidates[0]), (snapshot) => {
      if (!snapshot.exists()) {
        finalize([]);
        return;
      }

      const flattened = getRowsFromPayload(snapshot.val());
      const rows = flattened.rows;
      finalize(rows, null, flattened.lastUpdated || rows.find((row) => row.lastUpdated)?.lastUpdated || null);
    }, (error) => {
      finalize([], error.message);
    });

    return () => {
      active = false;
      cancelAnimationFrame(frameId);
      clearTimeout(timerId);
      unsubscribe();
    };
  }, [enabled, movieSlug, showDate, refreshKey]);

  return useMemo(() => data, [data]);
};
