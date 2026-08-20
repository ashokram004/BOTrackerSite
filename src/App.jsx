import { useFandangoData } from './hooks/useFandangoData';
import { useIndiaMovieData } from './hooks/useIndiaMovieData';
import { KPIGrid } from './components/KPIGrid';
import { DataTable } from './components/DataTable';
import { ShowsTable } from './components/ShowsTable';
import { HistoryTable } from './components/HistoryTable';
import { FilterPanel } from './components/FilterPanel';
import { DifferenceTable } from './components/DifferenceTable';
import { generateImageReport } from './utils/imageGenerator';
import { PacingChart } from './components/PacingChart';
import { IndiaMovieDashboard } from './components/IndiaMovieDashboard';
import { DashboardHeader } from './components/DashboardHeader';
import { database, databaseUrl } from './firebaseConfig';
import { get, ref } from 'firebase/database';
import './App.css';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const REGION_META = {
  usa: {
    label: 'USA',
    description: 'US box office dashboard'
  },
  india: {
    label: 'India',
    description: 'Indian box office dashboard'
  }
};

const getMovieRootCandidates = (region) => {
  const normalized = String(region || '').toLowerCase();
  if (normalized === 'india') {
    return ['India/movies'];
  }
  return ['movies'];
};

const getMovieDatePathCandidates = (region, movieSlug) => {
  const rootCandidates = getMovieRootCandidates(region);
  return rootCandidates.map((root) => `${root}/${movieSlug}`);
};

const prettifySlug = (value) =>
  (value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const sessionMovieCache = new Map();
const sessionDateCache = new Map();

window.addEventListener('pagehide', () => {
  sessionMovieCache.clear();
  sessionDateCache.clear();
});

const getShallowPath = (path) => {
  if (!databaseUrl) return null;
  const encodedPath = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `${databaseUrl.replace(/\/$/, '')}/${encodedPath}.json?shallow=true`;
};

const loadShallowKeys = async (path) => {
  const shallowPath = getShallowPath(path);
  if (!shallowPath) return null;

  try {
    const response = await fetch(shallowPath);
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.warn('Firebase shallow metadata unavailable; using SDK fallback.', error);
    return null;
  }
};

const hasKeys = (value) => value && typeof value === 'object' && Object.keys(value).length > 0;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const loadNodeWithRetry = async (roots, attempts = 4) => {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const shallow = await loadShallowKeys(roots[0]);
      if (hasKeys(shallow)) return shallow;

      const snapshots = await Promise.all(roots.map((rootPath) => get(ref(database, rootPath))));
      const snapshot = snapshots.find((candidate) => candidate.exists());
      if (snapshot) return snapshot.val() || {};
      throw new Error(`Firebase path not found: ${roots[0]}`);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await wait(500 * (attempt + 1));
    }
  }

  throw lastError || new Error('Firebase request failed');
};

function App() {
  const { region: routeRegion, movie: routeMovieSlug, date: routeDate } = useParams();
  const navigate = useNavigate();
  const normalizedRegion = routeRegion === 'usa' || routeRegion === 'india' ? routeRegion : null;
  const routeMovie = routeMovieSlug ? { id: routeMovieSlug, name: prettifySlug(routeMovieSlug) } : null;
  const [selectedRegion, setSelectedRegion] = useState(normalizedRegion);
  const [movies, setMovies] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(routeMovie);
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(routeDate || null);
  const [movieLoading, setMovieLoading] = useState(Boolean(normalizedRegion && !routeMovieSlug));
  const [movieError, setMovieError] = useState(null);
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState(null);
  const [diffMode, setDiffMode] = useState('hourly');
  const [indiaRefreshKey, setIndiaRefreshKey] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const nextMovie = routeMovieSlug ? { id: routeMovieSlug, name: prettifySlug(routeMovieSlug) } : null;
    const timerId = setTimeout(() => {
      setSelectedRegion(normalizedRegion);
      setSelectedMovie(nextMovie);
      setSelectedDate(routeDate || null);
      setMovieError(null);
      setDateError(null);
    }, 0);
    return () => clearTimeout(timerId);
  }, [normalizedRegion, routeDate, routeMovieSlug]);

  useEffect(() => {
    if (!selectedRegion) {
      return;
    }

    const roots = getMovieRootCandidates(selectedRegion);
    let active = true;

    const loadMovies = async () => {
      try {
        const cacheKey = selectedRegion;
        let raw = sessionMovieCache.get(cacheKey);
        if (!raw) {
          raw = await loadNodeWithRetry(roots);
          if (raw && Object.keys(raw).length > 0) {
            sessionMovieCache.set(cacheKey, raw);
          }
        }
        if (!active) return;

        const movieList = Object.entries(raw)
          .filter(([, value]) => value !== null && value !== undefined)
          .map(([id, value]) => ({
            id,
            name: value && typeof value === 'object' && value.name ? value.name : prettifySlug(id),
            raw: value
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setMovies(movieList);
        setMovieError(null);
        setSelectedMovie((prev) => (prev && movieList.some((movie) => movie.id === prev.id) ? prev : null));
        if (!movieList.length) {
          setDates([]);
          setSelectedDate(null);
        }
      } catch (error) {
        if (!active) return;
        console.error('Error loading movies:', error);
        setMovieError('Unable to load movies. Retrying may help.');
      } finally {
        if (active) setMovieLoading(false);
      }
    };

    loadMovies();

    return () => {
      active = false;
    };
  }, [routeMovieSlug, selectedRegion]);

  useEffect(() => {
    if (!selectedRegion || !selectedMovie) {
      return;
    }

    const roots = getMovieDatePathCandidates(selectedRegion, selectedMovie.id);
    let active = true;

    const loadDates = async () => {
      try {
        const cacheKey = `${selectedRegion}/${selectedMovie.id}`;
        let raw = sessionDateCache.get(cacheKey);
        if (!raw) {
          raw = await loadNodeWithRetry(roots);
          if (raw && Object.keys(raw).length > 0) {
            sessionDateCache.set(cacheKey, raw);
          }
        }
        if (!active) return;

        const dateKeys = Object.keys(raw)
          .filter((key) => key && raw[key] !== null && raw[key] !== undefined)
          .sort()
          .reverse();

        setDates(dateKeys);
        setDateError(null);
        setSelectedDate((prev) => (prev && dateKeys.includes(prev) ? prev : null));
      } catch (error) {
        if (!active) return;
        console.error('Error loading dates:', error);
        setDateError('Unable to load dates. Retrying may help.');
      } finally {
        if (active) setDateLoading(false);
      }
    };

    loadDates();

    return () => {
      active = false;
    };
  }, [selectedMovie, selectedRegion]);

  const shouldFetchDashboard = Boolean(selectedRegion && selectedMovie && selectedDate);
  const selectedMovieId = selectedMovie?.id || '';
  const selectedDateValue = selectedDate || '';

  const dashboardData = useFandangoData({
    diffMode,
    region: selectedRegion || 'usa',
    movieSlug: selectedMovieId,
    showDate: selectedDateValue,
    includeDifferences: selectedRegion !== 'india',
    enabled: shouldFetchDashboard && selectedRegion !== 'india',
    refreshKey: reloadKey
  });

  const indiaDashboardData = useIndiaMovieData({
    enabled: shouldFetchDashboard && selectedRegion === 'india',
    movieSlug: selectedMovieId,
    showDate: selectedDateValue,
    refreshKey: indiaRefreshKey
  });

  const {
    loading,
    kpis,
    tables,
    metadata,
    error,
    rawRows,
    historyData,
    differences,
    includeDifferences
  } = selectedRegion === 'india' ? { loading: indiaDashboardData.loading, kpis: null, tables: null, metadata: { showDate: indiaDashboardData.showDate }, error: indiaDashboardData.error, rawRows: indiaDashboardData.rows, historyData: [], differences: null, includeDifferences: false } : dashboardData;

  const dashboardIsCurrent = selectedRegion === 'india'
    ? indiaDashboardData.movieName === selectedMovieId && indiaDashboardData.showDate === selectedDateValue
    : metadata?.movieSlug === selectedMovieId && metadata?.showDate === selectedDateValue;
  const dashboardLoading = loading || !dashboardIsCurrent;

  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    state: 'ALL',
    chain: 'ALL',
    theater: 'ALL',
    format: 'ALL',
    language: 'ALL',
    timeCat: 'ALL'
  });

  const allRows = useMemo(() => rawRows || [], [rawRows]);

  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      if (filters.state !== 'ALL' && r.state !== filters.state) return false;
      if (filters.chain !== 'ALL' && r.chain !== filters.chain) return false;
      if (filters.theater !== 'ALL' && r.theater !== filters.theater) return false;
      if (filters.format !== 'ALL' && r.format !== filters.format) return false;
      if (filters.language !== 'ALL' && r.language !== filters.language) return false;
      if (filters.timeCat !== 'ALL' && r.timeCat !== filters.timeCat) return false;
      return true;
    });
  }, [allRows, filters]);

  const filteredSummary = useMemo(() => {
    const summary = {
      formats: {},
      languages: {},
      states: {},
      theaters: {},
      chains: {},
      timeCats: {}
    };

    let totalGross = 0;
    let totalTickets = 0;
    let totalBooked = 0;
    const venues = new Set();

    let sTotalGross = 0;
    let sTotalTickets = 0;
    let sTotalBooked = 0;
    const sVenues = new Set();
    let sShows = 0;
    let validShows = 0;

    filteredRows.forEach((r) => {
      const gross = Number(r.gross || 0);
      const tickets = Number(r.total || 0);
      const booked = Number(r.booked || 0);

      const s_gross = Number(r.s_gross || 0);
      const s_tickets = Number(r.s_total || 0);
      const s_booked = Number(r.s_booked || 0);

      totalGross += gross;
      totalTickets += tickets;
      totalBooked += booked;

      sTotalGross += s_gross;
      sTotalTickets += s_tickets;
      sTotalBooked += s_booked;

      const isExtra = r.is_extra || r.t_id === 'EXTRA';

      if (!isExtra) {
        validShows += 1;
        if (r.t_id) venues.add(r.t_id);

        if (r.has_snapshot) {
          sShows += 1;
          if (r.t_id) sVenues.add(r.t_id);
        }

        const addItem = (dict, key, label) => {
          if (!dict[key]) {
            dict[key] = {
              name: label,
              shows: 0,
              tickets: 0,
              booked: 0,
              gross: 0,
              d_booked: 0,
              d_gross: 0,
              d_tickets: 0,
              occ: 0,
              id: key,
              s_gross: 0,
              s_booked: 0,
              s_tickets: 0
            };
          }
          dict[key].shows += 1;
          dict[key].tickets += tickets;
          dict[key].booked += booked;
          dict[key].gross += gross;

          dict[key].s_gross += s_gross;
          dict[key].s_booked += s_booked;
          dict[key].s_tickets += s_tickets;

          dict[key].occ = dict[key].tickets > 0 ? (dict[key].booked / dict[key].tickets) * 100 : 0;

          dict[key].d_gross = dict[key].gross - dict[key].s_gross;
          dict[key].d_booked = dict[key].booked - dict[key].s_booked;
          dict[key].d_tickets = dict[key].tickets - dict[key].s_tickets;
        };

        addItem(summary.formats, r.format || 'Unknown', r.format || 'Unknown');
        addItem(summary.languages, r.language || 'Unknown', r.language || 'Unknown');
        addItem(summary.states, r.state || 'Unknown', r.state || 'Unknown');
        addItem(summary.theaters, r.t_id || r.theater || 'Unknown', r.theater || 'Unknown');
        addItem(summary.chains, r.chain || 'Unknown', r.chain || 'Unknown');
        addItem(summary.timeCats, r.timeCat || 'Unknown', r.timeCat || 'Unknown');
      } else {
        const lang = 'Telugu';
        if (!summary.languages[lang]) {
          summary.languages[lang] = {
            name: lang,
            shows: 0,
            tickets: 0,
            booked: 0,
            gross: 0,
            d_booked: 0,
            d_gross: 0,
            d_tickets: 0,
            occ: 0,
            id: lang,
            s_gross: 0,
            s_booked: 0,
            s_tickets: 0
          };
        }
        summary.languages[lang].tickets += tickets;
        summary.languages[lang].booked += booked;
        summary.languages[lang].gross += gross;

        summary.languages[lang].s_gross += s_gross;
        summary.languages[lang].s_booked += s_booked;
        summary.languages[lang].s_tickets += s_tickets;

        summary.languages[lang].occ = summary.languages[lang].tickets > 0 ? (summary.languages[lang].booked / summary.languages[lang].tickets) * 100 : 0;

        summary.languages[lang].d_gross = summary.languages[lang].gross - summary.languages[lang].s_gross;
        summary.languages[lang].d_booked = summary.languages[lang].booked - summary.languages[lang].s_booked;
        summary.languages[lang].d_tickets = summary.languages[lang].tickets - summary.languages[lang].s_tickets;
      }
    });

    const buildList = (dict) => Object.values(dict).sort((a, b) => b.gross - a.gross);

    return {
      kpis: {
        totalGross: { val: totalGross, delta: totalGross - sTotalGross },
        totalTickets: { val: totalTickets, delta: totalTickets - sTotalTickets },
        totalBooked: { val: totalBooked, delta: totalBooked - sTotalBooked },
        totalVenues: { val: venues.size, delta: venues.size - sVenues.size },
        totalShows: { val: validShows, delta: validShows - sShows },
        occupancy: { val: totalTickets > 0 ? (totalBooked / totalTickets) * 100 : 0 }
      },
      tables: {
        formats: buildList(summary.formats),
        languages: buildList(summary.languages),
        states: buildList(summary.states),
        theaters: buildList(summary.theaters),
        chains: buildList(summary.chains),
        timeCats: buildList(summary.timeCats)
      }
    };
  }, [filteredRows]);

  const noFiltersSelected = Object.values(filters).every((value) => value === 'ALL');
  const displayedKpis = noFiltersSelected ? kpis : filteredSummary.kpis;
  const displayedTables = noFiltersSelected ? tables : filteredSummary.tables;

  const handleExportImage = async () => {
    if (isGeneratingImg) return;
    setIsGeneratingImg(true);
    try {
      const dataUrl = await generateImageReport(kpis, tables, metadata, selectedMovie?.name);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `BoxOffice_${selectedRegion || 'usa'}_${diffMode}_report.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error('Error generating image:', e);
      alert('Failed to generate image.');
    } finally {
      setIsGeneratingImg(false);
    }
  };

  const regionTitle = selectedRegion ? REGION_META[selectedRegion]?.label : 'Box Office Tracker';

  const handleSelectRegion = (key) => {
    setSelectedRegion(key);
    setMovies([]);
    setMovieError(null);
    setSelectedMovie(null);
    setDates([]);
    setDateError(null);
    setSelectedDate(null);
    setMovieLoading(true);
    setDateLoading(false);
    navigate(`/${key}`);
  };

  const renderDashboard = () => {
    if (dashboardLoading) {
      return <div style={{ color: '#f8fafc', padding: '20px' }}>Loading {regionTitle} data...</div>;
    }

    if (selectedRegion === 'india') {
      return (
        <IndiaMovieDashboard
          rows={indiaDashboardData.rows || []}
          movieName={selectedMovie?.name || prettifySlug(selectedMovieId)}
          showDate={selectedDateValue}
          lastUpdated={indiaDashboardData.lastUpdated || 'N/A'}
          onBack={() => {
            setSelectedDate(null);
            navigate(`/${selectedRegion}/${encodeURIComponent(selectedMovieId)}`);
          }}
          onChangeMovie={() => {
            setSelectedDate(null);
            setSelectedMovie(null);
            navigate(`/${selectedRegion}`);
          }}
          onHome={() => {
            setSelectedDate(null);
            setSelectedMovie(null);
            setSelectedRegion(null);
            navigate('/');
          }}
          onReload={() => setIndiaRefreshKey((value) => value + 1)}
        />
      );
    }

    if (error) {
      return <div style={{ color: '#f87171', padding: '20px' }}>Error: {error}</div>;
    }

    return (
      <div id="app">
        <div className="container">
          <DashboardHeader
            marketLabel={selectedRegion ? `${REGION_META[selectedRegion]?.label} Box Office Tracking` : 'Box Office Tracking'}
            movieName={selectedMovie?.name || prettifySlug(selectedMovieId)}
            showDate={metadata?.showDate || selectedDateValue}
            lastUpdated={metadata ? `${metadata.lastUpdated} IST${metadata.growthSince ? ` • Growth since ${metadata.growthSince} IST` : ''}` : 'N/A'}
            leftActions={[
              { label: 'Home', onClick: () => {
                  setSelectedDate(null);
                  setSelectedMovie(null);
                  setSelectedRegion(null);
                  navigate('/');
                }, variant: 'secondary' },
              { label: 'Change Movie', onClick: () => {
                  setSelectedMovie(null);
                  setSelectedDate(null);
                  navigate(`/${selectedRegion}`);
                }, variant: 'secondary' },
              { label: 'Change Date', onClick: () => {
                  setSelectedDate(null);
                  navigate(`/${selectedRegion}/${encodeURIComponent(selectedMovieId)}`);
                }, variant: 'secondary' },
              { label: 'Reload Data', onClick: () => setReloadKey((value) => value + 1), variant: 'secondary' }
            ]}
            rightActions={[
              { label: showFilters ? 'Hide Filters' : 'Show Filters', onClick: () => setShowFilters((v) => !v), variant: 'primary' },
              { label: diffMode === 'daily' ? 'Viewing: Daily Growth' : 'Viewing: Hourly Growth', onClick: () => setDiffMode((m) => (m === 'daily' ? 'hourly' : 'daily')), variant: 'secondary' },
              { label: isGeneratingImg ? 'Generating...' : 'Export Image', onClick: handleExportImage, variant: 'secondary', disabled: isGeneratingImg }
            ]}
          />

          {allRows.length > 0 && (
            <FilterPanel
              rawRows={allRows}
              filters={filters}
              setFilters={setFilters}
              showFilters={showFilters}
            />
          )}

          <KPIGrid kpis={displayedKpis} />

          <div className="dashboard-row">
            {displayedTables?.formats && <DataTable title="Format Distribution" data={displayedTables.formats} isFormat />}
            {displayedTables?.languages && <DataTable title="Language Distribution" data={displayedTables.languages} isLanguage />}
          </div>

          <div className="dashboard-row">
            {displayedTables?.states && <DataTable title="State Distribution" data={displayedTables.states} isState />}
            {displayedTables?.theaters && <DataTable title="Top Theatres" data={displayedTables.theaters} isTheater />}
          </div>

          <div className="dashboard-row">
            <DataTable
              title="Theatre Chain Distribution"
              data={displayedTables?.chains || []}
            />
            <DataTable
              title="Time Of Day Analysis"
              data={displayedTables?.timeCats || []}
            />
          </div>

          <div className="dashboard-row" style={{ gridTemplateColumns: '1fr' }}>
            <ShowsTable rows={filteredRows} />
          </div>

          {historyData && historyData.length > 0 && (
            <div className="dashboard-row" style={{ gridTemplateColumns: '1fr' }}>
              <HistoryTable data={historyData} />
            </div>
          )}

          {historyData && historyData.length > 0 && (
            <div className="dashboard-row" style={{ gridTemplateColumns: '1fr' }}>
              <PacingChart historyData={historyData} />
            </div>
          )}

          {includeDifferences && differences && (
            <div className="differences-container" style={{ marginTop: '40px' }}>
              <h2 style={{ fontSize: '24px', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '10px' }}>
                Difference Details ({diffMode === 'hourly' ? 'Hourly' : 'Daily'})
              </h2>
              <div className="dashboard-row">
                <DifferenceTable title="New Shows Added" data={differences.addedShows} type="added" />
                <DifferenceTable title="Shows Cancelled/Removed" data={differences.removedShows} type="removed" />
              </div>
              <div className="dashboard-row">
                <DifferenceTable title="Existing Shows Tickets Growth" data={differences.ticketsBooked} type="booked" />
                <DifferenceTable title="Existing Shows Cancelled Tickets" data={differences.ticketsCancelled} type="cancelled" />
              </div>
            </div>
          )}

          <div className="footer">
            @TheWkndCinema • {REGION_META[selectedRegion]?.label || 'Box Office'} • Data from Firebase
          </div>
        </div>
      </div>
    );
  };

  if (!selectedRegion) {
    return (
      <div className="container" style={{ maxWidth: 1100, margin: '40px auto', padding: '20px', width: '100%' }}>
        <div style={{ marginBottom: '30px', textAlign: 'center' }}>
          <p style={{ color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '12px' }}>Box Office</p>
          <h1 style={{ fontSize: '36px', marginTop: '8px' }}>Choose a market</h1>
        </div>

        <div className="dashboard-row" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', width: '100%', maxWidth: '100%' }}>
          {Object.entries(REGION_META).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSelectRegion(key)}
              className="selection-card"
              style={{
                textAlign: 'left',
                background: 'linear-gradient(180deg, rgba(15,23,42,0.9), rgba(15,23,42,0.65))',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                color: '#f8fafc',
                borderRadius: '18px',
                padding: '28px',
                cursor: 'pointer',
                minHeight: '220px',
                boxShadow: '0 20px 50px rgba(15,23,42,0.28)'
              }}
            >
              <div style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Market</div>
              <div style={{ fontSize: '32px', fontWeight: 700, margin: '16px 0 8px' }}>{meta.label}</div>
              <div style={{ color: '#cbd5e1', fontSize: '16px', lineHeight: 1.6 }}>{meta.description}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!selectedMovie) {
    return (
      <div className="container" style={{ maxWidth: 1100, margin: '40px auto', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <p style={{ color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '12px' }}>Market</p>
            <h2 style={{ fontSize: '28px', marginTop: '8px' }}>{REGION_META[selectedRegion].label}</h2>
          </div>
          <button onClick={() => {
            setSelectedRegion(null);
            navigate('/');
          }} className="toggle-filter-btn">Back</button>
        </div>

        {movieLoading ? (
          <div style={{ color: '#f8fafc', padding: '20px' }}>Loading movies...</div>
        ) : movieError ? (
          <div style={{ color: '#f87171', padding: '20px' }}>{movieError}</div>
        ) : movies.length === 0 ? (
          <div style={{ color: '#f8fafc', padding: '20px' }}>No movies found for {REGION_META[selectedRegion].label}.</div>
        ) : (
          <div className="dashboard-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {movies.map((movie) => (
              <button
                key={movie.id}
                type="button"
                onClick={() => {
                  setDateLoading(true);
                  setDateError(null);
                  setSelectedMovie(movie);
                  navigate(`/${selectedRegion}/${encodeURIComponent(movie.id)}`);
                }}
                className="selection-card"
                style={{
                  background: 'linear-gradient(180deg, rgba(15,23,42,0.9), rgba(15,23,42,0.7))',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '16px',
                  padding: '20px',
                  color: '#f8fafc',
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: '0 16px 40px rgba(15,23,42,0.26)'
                }}
              >
                <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Movie</div>
                <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '14px' }}>{movie.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!selectedDate) {
    return (
      <div className="container" style={{ maxWidth: 1100, margin: '40px auto', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <p style={{ color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '12px' }}>Movie</p>
            <h2 style={{ fontSize: '28px', marginTop: '8px' }}>{selectedMovie.name}</h2>
          </div>
          <button onClick={() => {
            setSelectedMovie(null);
            navigate(`/${selectedRegion}`);
          }} className="toggle-filter-btn">Back</button>
        </div>

        {dateLoading ? (
          <div style={{ color: '#f8fafc', padding: '20px' }}>Loading dates...</div>
        ) : dateError ? (
          <div style={{ color: '#f87171', padding: '20px' }}>{dateError}</div>
        ) : dates.length === 0 ? (
          <div style={{ color: '#f8fafc', padding: '20px' }}>No dates found for this movie.</div>
        ) : (
          <div className="dashboard-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {dates.map((date) => (
              <button
                key={date}
                type="button"
                onClick={() => {
                  setSelectedDate(date);
                  navigate(`/${selectedRegion}/${encodeURIComponent(selectedMovie.id)}/${encodeURIComponent(date)}`);
                }}
                className="selection-card"
                style={{
                  background: 'linear-gradient(180deg, rgba(15,23,42,0.9), rgba(15,23,42,0.7))',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '16px',
                  padding: '20px',
                  color: '#f8fafc',
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: '0 16px 40px rgba(15,23,42,0.26)'
                }}
              >
                <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Date</div>
                <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '12px' }}>{date}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return renderDashboard();
}

export default App;