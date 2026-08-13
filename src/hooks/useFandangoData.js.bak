import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebaseConfig';

const MOVIE_SLUG = 'peddi-2026';
const SHOW_DATE = '2026-06-03';

export const useFandangoData = () => {
  const [data, setData] = useState({
    loading: true,
    kpis: null,
    tables: null,
    rawRows: [],
    historyData: [],
    filteredKpis: null,
    metadata: null,
    error: null
  });

  useEffect(() => {
    const currentRef = ref(database, `movies/${MOVIE_SLUG}/${SHOW_DATE}/master_shows_data`);
    const snapshotRef = ref(database, `movies/${MOVIE_SLUG}/${SHOW_DATE}/last_snapshot`);
    const historyRef = ref(database, `movies/${MOVIE_SLUG}/${SHOW_DATE}/history`);

    let currentData = null;
    let snapshotData = null;
    let historyDataRaw = null;
    let lastUpdated = 'N/A';
    let growthSince = 'N/A';

    const formatUtcToIst = (value) => {
      // Expecting UTC timestamp string/number in `last_snapshot/timestamp`
      // Convert to IST: Asia/Kolkata
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

    function formatDate(dateObj) {
      if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return 'N/A';

      const months = [
          "Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];

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

    const process = () => {
      if (!currentData || !snapshotData) return;



      const toArray = (value) => {
        if (Array.isArray(value)) return value;
        if (!value) return [];
        return Object.values(value);
      };

      const normalizeNumber = (value) => {
        const normalized = Number(value);
        return Number.isFinite(normalized) ? normalized : 0;
      };

      const rawCurrent = toArray(currentData.data || currentData);
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
          // fallback: if parse fails, try manual patterns like `3:05 PM`
          if (hours === null) {
            const m = cleanTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
            if (!m) return '7. Unknown Time';
            let h = parseInt(m[1], 10);
            const ampm = m[3].toUpperCase();
            if (ampm === 'PM' && h !== 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            // categorize
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

      // --- Helper to aggregate data ---
      const aggregate = (dataset) => {
        let totalGross = 0;
        let totalTickets = 0;
        let totalBooked = 0;
        
        let validShows = 0;
        let validVenues = new Set();
        let validCapacity = 0;
        let validBooked = 0;

        const summary = {
          formats: {},
          languages: {},
          states: {},
          theaters: {},
          chains: {},
          timeCats: {}
        };

        dataset.forEach(row => {
          const gross = normalizeNumber(row.gross);
          const booked = normalizeNumber(row.booked);
          const tickets = normalizeNumber(row.total);
          const isExtra = row.is_extra || row.t_id === 'EXTRA';

          totalGross += gross;
          totalTickets += tickets;
          totalBooked += booked;

          if (!isExtra) {
            validShows += 1;
            validVenues.add(row.t_id);
            validCapacity += tickets;
            validBooked += booked;

            const format = row.format?.includes('D-Box') && row.format?.includes('Premium') ? 'Premium' : (row.format || 'Unknown');
            const lang = row.language || 'Unknown';
            const state = row.state || 'Unknown';
            const theater = row.theater || 'Unknown';
            
            const chain = getChainCategory(theater);
            const timeCat = getTimeCategory(row.time || 'Unknown');

            if (!summary.formats[format]) summary.formats[format] = { name: format, shows: 0, tickets: 0, booked: 0, gross: 0, d_booked: 0, d_gross: 0, d_tickets: 0 };
            summary.formats[format].shows += 1;
            summary.formats[format].tickets += tickets;
            summary.formats[format].booked += booked;
            summary.formats[format].gross += gross;

            if (!summary.languages[lang]) summary.languages[lang] = { name: lang, shows: 0, tickets: 0, booked: 0, gross: 0, d_booked: 0, d_gross: 0, d_tickets: 0 };
            summary.languages[lang].shows += 1;
            summary.languages[lang].tickets += tickets;
            summary.languages[lang].booked += booked;
            summary.languages[lang].gross += gross;

            if (!summary.states[state]) summary.states[state] = { name: state, shows: 0, tickets: 0, booked: 0, gross: 0, d_booked: 0, d_gross: 0, d_tickets: 0 };
            summary.states[state].shows += 1;
            summary.states[state].tickets += tickets;
            summary.states[state].booked += booked;
            summary.states[state].gross += gross;

            if (!summary.theaters[row.t_id]) summary.theaters[row.t_id] = { id: row.t_id, name: theater, shows: 0, tickets: 0, booked: 0, gross: 0, d_booked: 0, d_gross: 0, d_tickets: 0 };
            summary.theaters[row.t_id].shows += 1;
            summary.theaters[row.t_id].tickets += tickets;
            summary.theaters[row.t_id].booked += booked;
            summary.theaters[row.t_id].gross += gross;

            if (!summary.chains[chain]) summary.chains[chain] = { name: chain, shows: 0, tickets: 0, booked: 0, gross: 0, d_booked: 0, d_gross: 0, d_tickets: 0 };
            summary.chains[chain].shows += 1;
            summary.chains[chain].tickets += tickets;
            summary.chains[chain].booked += booked;
            summary.chains[chain].gross += gross;

            if (!summary.timeCats[timeCat]) summary.timeCats[timeCat] = { name: timeCat, shows: 0, tickets: 0, booked: 0, gross: 0, d_booked: 0, d_gross: 0, d_tickets: 0 };
            summary.timeCats[timeCat].shows += 1;
            summary.timeCats[timeCat].tickets += tickets;
            summary.timeCats[timeCat].booked += booked;
            summary.timeCats[timeCat].gross += gross;
          }
        });

        return {
          totalGross,
          totalTickets,
          totalBooked,
          totalShows: validShows,
          totalVenues: validVenues.size,
          occupancy: validCapacity > 0 ? (validBooked / validCapacity) * 100 : 0,
          totalCapacity: validCapacity, // used for display text
          summary
        };
      };

      const curr = aggregate(rawCurrent);
      const snap = aggregate(rawSnapshot);

      const getSnapshotItem = (item, snapDict, isTheater) => {
        if (!snapDict) return null;
        if (isTheater) {
          return Object.values(snapDict).find((x) => x.id === item.id) || null;
        }

        if (snapDict[item.name]) return snapDict[item.name];

        return Object.values(snapDict).find((x) => x.name?.toString().toLowerCase() === item.name?.toString().toLowerCase()) || null;
      };

      // --- Build Deltas ---
      const kpis = {
        totalGross: { val: curr.totalGross, delta: curr.totalGross - snap.totalGross },
        totalTickets: { val: curr.totalTickets, delta: curr.totalTickets - snap.totalTickets },
        totalBooked: { val: curr.totalBooked, delta: curr.totalBooked - snap.totalBooked },
        totalVenues: { val: curr.totalVenues, delta: curr.totalVenues - snap.totalVenues },
        totalShows: { val: curr.totalShows, delta: curr.totalShows - snap.totalShows },
        occupancy: { val: curr.occupancy, capacity: curr.totalCapacity }
      };

      // --- Build Raw Rows (used for reactive filtering table) ---
      const normalizeFormat = (fmt) => {
        const f = fmt || 'Standard';
        return f?.includes('D-Box') && f?.includes('Premium') ? 'Premium' : f;
      };

      const rawRows = rawCurrent.map((row) => {
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

        return {
          t_id: row.t_id || '',
          id: `${row.t_id || ''}_${row.time || ''}_${format || ''}_${language || ''}_${theater || ''}`,
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
          is_extra
        };
      });

      const buildTable = (currDict, snapDict, isTheater = false) => {
        return Object.values(currDict).map((item) => {
          const sItem = getSnapshotItem(item, snapDict, isTheater);
          const d_gross = normalizeNumber(item.gross) - normalizeNumber(sItem?.gross);
          const d_booked = normalizeNumber(item.booked) - normalizeNumber(sItem?.booked);
          const d_tickets = normalizeNumber(item.tickets) - normalizeNumber(sItem?.tickets);
          const occ = normalizeNumber(item.tickets) > 0 ? (normalizeNumber(item.booked) / normalizeNumber(item.tickets)) * 100 : 0;
          return { ...item, d_gross, d_booked, d_tickets, occ };
        }).sort((a, b) => b.gross - a.gross);
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
        const venues = new Set(rows.map((r) => r.t_id).filter(Boolean));
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

      setData({
        loading: false,
        kpis,
        tables,
        rawRows,
        historyData: historyDataRaw || [],
        filteredKpis: initialFilteredKpis,
        metadata: {
          lastUpdated: formatDate(lastUpdated),
          growthSince: growthSince,
          showDate: SHOW_DATE
        },
        error: null
      });
    };

    const unsubCurrent = onValue(currentRef, (snapshot) => {
      currentData = snapshot.val() || { data: [] };
      if (currentData.last_updated) {
          lastUpdated = new Date(currentData.last_updated);
      }
      process();
    }, (error) => {
        setData(prev => ({ ...prev, loading: false, error: error.message }));
    });

    const unsubSnapshot = onValue(snapshotRef, (snapshot) => {
      snapshotData = snapshot.val() || { data: [] };

      // `last_snapshot/timestamp` is UTC; convert for display
      if (snapshotData?.timestamp) {
        growthSince = formatUtcToIst(snapshotData.timestamp);
      }

      process();
    });

    const unsubHistory = onValue(historyRef, (snapshot) => {
      const hData = snapshot.val();
      if (hData) {
        historyDataRaw = Object.values(hData).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      } else {
        historyDataRaw = [];
      }
      process();
    });

    return () => {
      unsubCurrent();
      unsubSnapshot();
      unsubHistory();
    };
  }, []);

  return data;
};