import { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../firebaseConfig';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatTimeValue = (value) => {
  if (!value || value === 'Unknown') return 'Unknown';

  try {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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

const extractLastUpdated = (value) => {
  const queue = [value];
  const seen = new Set();

  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== 'object') continue;
    const identity = typeof item === 'object' ? JSON.stringify(item) : String(item);
    if (seen.has(identity)) continue;
    seen.add(identity);

    const candidate = item.last_updated || item.lastUpdated || item.updated_at || item.updatedAt || item.timestamp || item.timeStamp || item.lastSync;
    if (candidate) return candidate;

    if (Array.isArray(item)) {
      queue.push(...item);
      continue;
    }

    queue.push(...Object.values(item));
  }

  return null;
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
  const city = row.city || row.City || '';
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

  const queue = Array.isArray(value) ? [...value] : [value];
  const seen = new Set();
  const rows = [];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (isIndiaRowCandidate(current)) {
      const normalized = normalizeIndiaRow(current);
      const identity = getRowIdentity(normalized.raw || current);
      if (!seen.has(identity)) {
        seen.add(identity);
        rows.push(normalized);
      }
    }

    queue.push(...Object.values(current));
  }

  return rows;
};

export const useIndiaMovieData = ({ enabled, movieSlug, showDate, refreshKey = 0 }) => {
  const [data, setData] = useState({ loading: true, rows: [], error: null, movieName: movieSlug || 'Movie', showDate: showDate || 'N/A', lastUpdated: 'N/A' });

  useEffect(() => {
    if (!enabled || !movieSlug || !showDate) {
      setData({ loading: false, rows: [], error: null, movieName: movieSlug || 'Movie', showDate: showDate || 'N/A', lastUpdated: 'N/A' });
      return undefined;
    }

    const candidates = [`India/movies/${movieSlug}/${showDate}`];

    let settled = false;
    const unsubscribes = [];

    const finalize = (rows, error = null, lastUpdatedValue = null) => {
      if (settled) return;
      settled = true;
      setData({
        loading: false,
        rows: rows || [],
        error,
        movieName: movieSlug,
        showDate,
        lastUpdated: formatIstDate(lastUpdatedValue || 'N/A')
      });
    };

    candidates.forEach((path) => {
      const refPath = ref(database, path);
      const unsubscribe = onValue(refPath, (snapshot) => {
        if (!snapshot.exists()) return;

        const value = snapshot.val();
        const extractedTimestamp = extractLastUpdated(value);
        const rows = flattenIndiaPayload(value);
        if (rows.length > 0) {
          finalize(rows, null, extractedTimestamp || rows.find((row) => row.lastUpdated)?.lastUpdated || null);
        }
      }, (error) => {
        if (!settled) finalize([], error.message);
      });

      unsubscribes.push(unsubscribe);
    });

    setTimeout(() => {
      if (!settled) finalize([]);
    }, 1800);

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [enabled, movieSlug, showDate, refreshKey]);

  return useMemo(() => data, [data]);
};
