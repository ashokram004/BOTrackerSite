import { useAnalyticsV2 } from './hooks/useAnalyticsV2';
import { KPIGrid } from './components/KPIGrid';
import { DataTable } from './components/DataTable';
import { ShowsTable } from './components/ShowsTable';
import { HistoryTable } from './components/HistoryTable';
import { FilterPanel } from './components/FilterPanel';
import { CUSTOM_TIME_RANGE, isTimeInRange } from './utils/timeFilter';
import { DifferenceTable } from './components/DifferenceTable';
import { DashboardHeader, DEFAULT_MOVIE_POSTER_URL } from './components/DashboardHeader';
import { LoadingState } from './components/LoadingState';
import { databaseUrl } from './firebaseConfig';
import './App.css';
import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSlidingIndicator } from './hooks/useSlidingIndicator';

const EMPTY_ARRAY = [];

const IndiaAnalyticsDashboard = lazy(() =>
  import('./components/IndiaAnalyticsDashboard').then(({ IndiaAnalyticsDashboard: Dashboard }) => ({
    default: Dashboard
  }))
);
const PacingChart = lazy(() =>
  import('./components/PacingChart').then(({ PacingChart: Chart }) => ({
    default: Chart
  }))
);

const REGION_META = {
  india: {
    label: 'India',
    description: 'Indian box office dashboard'
  },
  usa: {
    label: 'USA',
    description: 'US box office dashboard'
  }
};

const MovieShelfTabs = ({ activeShelf, onShelfChange, counts }) => {
  const { containerRef, indicatorStyle } = useSlidingIndicator(
    '.movie-list-tab.active',
    activeShelf
  );
  const shelves = [
    { id: 'coming_soon', label: 'Coming soon', count: counts.comingSoon },
    { id: 'now_playing', label: 'Now playing', count: counts.nowPlaying },
    { id: 'ended', label: 'Archive', count: counts.archive }
  ];

  return (
    <div ref={containerRef} className="movie-list-tabs" role="group" aria-label="Movie lifecycle">
      <span className="movie-list-tabs-indicator" aria-hidden="true" style={indicatorStyle} />
      {shelves.map((shelf) => (
        <button
          key={shelf.id}
          type="button"
          className={`movie-list-tab ${activeShelf === shelf.id ? 'active' : ''}`}
          aria-pressed={activeShelf === shelf.id}
          onClick={() => onShelfChange(shelf.id)}
        >
          {shelf.label} <span>{shelf.count}</span>
        </button>
      ))}
    </div>
  );
};

const SiteHeader = ({ theme, onToggleTheme, onHome, onSelectRegion, selectedRegion }) => {
  const { containerRef: navRef, indicatorStyle: navIndicatorStyle } = useSlidingIndicator(
    '.site-nav button.active',
    selectedRegion || 'overview'
  );

  return (
  <header className="site-header">
    <div className="site-header-inner">
      <button className="site-brand" type="button" onClick={onHome} aria-label="The Wknd Cinema home">
        <img className="site-brand-logo" src="/appicon.png" alt="" />
      </button>

      <nav ref={navRef} className="site-nav" aria-label="Main navigation">
        <span className="site-nav-indicator" aria-hidden="true" style={navIndicatorStyle} />
        <button type="button" className={!selectedRegion ? 'active' : ''} onClick={onHome}>
          Overview
        </button>
        <span className="site-nav-divider" aria-hidden="true" />
        {Object.entries(REGION_META).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            className={selectedRegion === key ? 'active' : ''}
            aria-current={selectedRegion === key ? 'page' : undefined}
            onClick={() => onSelectRegion(key)}
          >
            {meta.label}
          </button>
        ))}
      </nav>

      <div className="site-header-tools">
        <span className="site-live-indicator"><span aria-hidden="true" /> LIVE TRACKING</span>
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
    </div>
  </header>
  );
};

const getMovieRootCandidates = (region) => {
  const normalized = String(region || '').toLowerCase();
  if (normalized === 'india') {
    return ['markets/india/movie_index'];
  }
  return ['markets/usa/movie_index'];
};

const getMovieDatePathCandidates = (region, movieSlug) => {
  const market = String(region || '').toLowerCase() === 'india' ? 'india' : 'usa';
  return [`markets/${market}/movies/${movieSlug}/date_index`];
};

const prettifySlug = (value) =>
  (value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const sessionMovieCache = new Map();
const sessionDateCache = new Map();
const sessionProcessedMovieCache = new Map();

window.addEventListener('pagehide', () => {
  sessionMovieCache.clear();
  sessionDateCache.clear();
  sessionProcessedMovieCache.clear();
});

const getShallowPath = (path) => {
  if (!databaseUrl) return null;
  const encodedPath = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `${databaseUrl.replace(/\/$/, '')}/${encodedPath}.json?shallow=true`;
};

const loadShallowKeys = async (path) => {
  const shallowPath = getShallowPath(path);
  if (!shallowPath) throw new Error('Firebase database URL is not configured.');

  const response = await fetch(shallowPath);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Unable to load Firebase index (${response.status}): ${path}`);
  }
  return response.json();
};

const getMarketToday = (region) => {
  const timeZone = region === 'india' ? 'Asia/Kolkata' : 'America/New_York';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const dateParts = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
};

const getMovieLifecycleStatus = (dateKeys, today) => {
  const sortedDates = [...dateKeys].sort();
  if (!sortedDates.length) return 'ended';
  if (sortedDates[0] > today) return 'coming_soon';
  if (sortedDates[sortedDates.length - 1] < today) return 'ended';
  return 'now_playing';
};

const getDefaultMovieShelf = (movieList) => {
  if (movieList.some((movie) => movie.lifecycleStatus === 'now_playing')) return 'now_playing';
  if (movieList.some((movie) => movie.lifecycleStatus === 'coming_soon')) return 'coming_soon';
  return 'ended';
};

const getMovieShowDates = (movieIndex) =>
  Object.keys(movieIndex || {})
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && movieIndex[date] !== null)
    .sort((a, b) => b.localeCompare(a));

const getDatesBySalesMode = (showDates, today) => ({
  total: showDates.filter((date) => date <= today),
  advance: showDates
});

const getDefaultDateForSalesMode = (dates, salesMode, today) => {
  const sortedDates = [...dates].sort((a, b) => a.localeCompare(b));
  if (salesMode === 'total') {
    return sortedDates.filter((date) => date <= today).at(-1) || null;
  }

  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);
  return sortedDates.find((date) => date === tomorrowKey)
    || sortedDates.find((date) => date > today)
    || sortedDates.at(-1)
    || null;
};

const getMovieShowDatesForMovie = async (region, movieId) => {
  const cacheKey = `${region}/${movieId}`;
  const cachedDates = sessionDateCache.get(cacheKey);
  if (cachedDates) return cachedDates;

  const dateLoad = (async () => {
    const [movieRoot] = getMovieDatePathCandidates(region, movieId);
    const shallowPath = getShallowPath(movieRoot);
    if (!shallowPath) throw new Error('Firebase database URL is not configured.');

    const response = await fetch(shallowPath);
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`Unable to load show dates (${response.status}): ${movieRoot}`);
    }

    return getMovieShowDates(await response.json());
  })();
  sessionDateCache.set(cacheKey, dateLoad);

  try {
    return await dateLoad;
  } catch (error) {
    if (sessionDateCache.get(cacheKey) === dateLoad) sessionDateCache.delete(cacheKey);
    throw error;
  }
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const loadNodeWithRetry = async (roots, attempts = 4) => {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return (await loadShallowKeys(roots[0])) || {};
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
  const [theme, setTheme] = useState(() => localStorage.getItem('bo-tracker-theme') || 'dark');
  const normalizedRegion = routeRegion === 'usa' || routeRegion === 'india' ? routeRegion : null;
  const routeMovie = routeMovieSlug ? { id: routeMovieSlug, name: prettifySlug(routeMovieSlug) } : null;
  const [selectedRegion, setSelectedRegion] = useState(normalizedRegion);
  const [movies, setMovies] = useState([]);
  const [movieSearch, setMovieSearch] = useState('');
  const [movieShelf, setMovieShelf] = useState('now_playing');
  const [selectedMovie, setSelectedMovie] = useState(routeMovie);
  const [dates, setDates] = useState([]);
  const [datesBySalesMode, setDatesBySalesMode] = useState({ total: [], advance: [] });
  const [selectedDate, setSelectedDate] = useState(routeDate || null);
  const [movieLoading, setMovieLoading] = useState(Boolean(normalizedRegion && !routeMovieSlug));
  const [movieError, setMovieError] = useState(null);
  const [dateLoading, setDateLoading] = useState(Boolean(routeMovie && !routeDate));
  const [dateError, setDateError] = useState(null);
  const [diffMode, setDiffMode] = useState('hourly');
  const [showUsGrowth, setShowUsGrowth] = useState(true);
  const [showIndiaGrowth, setShowIndiaGrowth] = useState(true);
  const [indiaGrossMode, setIndiaGrossMode] = useState('bms');
  const [usDetailsContext, setUsDetailsContext] = useState('');
  const [usTheatersContext, setUsTheatersContext] = useState('');
  const [salesModeState, setSalesModeState] = useState({
    movieId: routeMovie?.id || '',
    mode: 'advance'
  });
  const selectedMovieId = selectedMovie?.id || '';
  const selectedDateValue = selectedDate || '';
  const dashboardContextKey = `${selectedRegion}/${selectedMovieId}/${selectedDateValue}/${salesModeState.movieId === selectedMovieId ? salesModeState.mode : 'advance'}`;
  const showUsDetails = usDetailsContext === dashboardContextKey;
  const showUsTheaters = usTheatersContext === dashboardContextKey;
  const salesView = salesModeState.movieId === selectedMovieId ? salesModeState.mode : 'advance';
  const isHistoricalAdvance = salesView === 'advance'
    && Boolean(selectedDateValue)
    && selectedDateValue <= getMarketToday(selectedRegion || 'usa');
  const salesGrowthEnabled = !isHistoricalAdvance;
  const [indiaRefreshKey, setIndiaRefreshKey] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [homeTransitionLoading, setHomeTransitionLoading] = useState(false);
  const themeTransitionTimeoutRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('bo-tracker-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.remove('theme-transitioning-to-light', 'theme-transitioning-to-dark');
    root.classList.add(theme === 'dark' ? 'theme-transitioning-to-light' : 'theme-transitioning-to-dark');
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
    window.clearTimeout(themeTransitionTimeoutRef.current);
    themeTransitionTimeoutRef.current = window.setTimeout(() => {
      root.classList.remove('theme-transitioning-to-light', 'theme-transitioning-to-dark');
    }, 560);
  };

  useEffect(() => {
    const nextMovie = routeMovieSlug ? { id: routeMovieSlug, name: prettifySlug(routeMovieSlug) } : null;
    setSelectedRegion((previous) => previous === normalizedRegion ? previous : normalizedRegion);
    setSelectedMovie((previous) =>
      previous?.id === nextMovie?.id
        ? previous
        : nextMovie
    );
    setSelectedDate((previous) => {
      const nextDate = routeDate || null;
      return previous === nextDate ? previous : nextDate;
    });
    setMovieError(null);
    setDateError(null);
  }, [normalizedRegion, routeDate, routeMovieSlug]);

  useEffect(() => {
    if (!selectedRegion) {
      return;
    }

    const cachedMovies = sessionProcessedMovieCache.get(selectedRegion);
    if (cachedMovies) {
      setMovies(cachedMovies);
      setMovieShelf(getDefaultMovieShelf(cachedMovies));
      setMovieLoading(false);
      return undefined;
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
            releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(value?.releaseDate || '') ? value.releaseDate : null,
            raw: value
          }));

        const today = getMarketToday(selectedRegion);
        const movieDateIndexes = await Promise.all(
          movieList.map((movie) => getMovieShowDatesForMovie(selectedRegion, movie.id))
        );
        const moviesWithLatestDates = movieList.map((movie, index) => {
          const movieDates = movieDateIndexes[index];
          return {
            ...movie,
            lifecycleStatus: getMovieLifecycleStatus(movieDates, today),
            firstDate: movieDates.at(-1) || null,
            latestDate: movieDates[0] || null
          };
        });

        moviesWithLatestDates.sort((a, b) => {
          const latestDateComparison = String(b.latestDate || '').localeCompare(String(a.latestDate || ''));
          return latestDateComparison || a.name.localeCompare(b.name);
        });

        sessionProcessedMovieCache.set(selectedRegion, moviesWithLatestDates);
        setMovies(moviesWithLatestDates);
        setMovieShelf(getDefaultMovieShelf(moviesWithLatestDates));
        setMovieError(null);
        setSelectedMovie((prev) => (prev && movieList.some((movie) => movie.id === prev.id) ? prev : null));
        if (!movieList.length) {
          setDates([]);
          setDatesBySalesMode({ total: [], advance: [] });
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
  }, [selectedRegion]);

  useEffect(() => {
    if (!selectedRegion || !selectedMovieId) {
      return;
    }

    let active = true;

    const loadDates = async () => {
      try {
        const showDates = await getMovieShowDatesForMovie(selectedRegion, selectedMovieId);
        if (!active) return;

        const today = getMarketToday(selectedRegion);
        const modeDates = getDatesBySalesMode(showDates, today);
        const dateKeys = showDates;
        setDatesBySalesMode(modeDates);
        setDates(dateKeys);
        setDateError(null);
        const isCurrentMovieRoute = routeMovieSlug === selectedMovieId;
        const requestedMode = salesView;
        const routeDateMode = Object.keys(modeDates).find((mode) => modeDates[mode].includes(routeDate));
        const otherMode = requestedMode === 'total' ? 'advance' : 'total';
        const nextMode = isCurrentMovieRoute && routeDateMode
          ? modeDates[requestedMode].includes(routeDate) ? requestedMode : routeDateMode
          : modeDates[requestedMode].length
            ? requestedMode
            : modeDates[otherMode].length
              ? otherMode
              : requestedMode;
        const modeDateKeys = modeDates[nextMode];
        const nextDate = isCurrentMovieRoute && modeDateKeys.includes(routeDate)
          ? routeDate
          : getDefaultDateForSalesMode(modeDateKeys, nextMode, today);
        setSalesModeState((previous) =>
          previous.movieId === selectedMovieId && previous.mode === nextMode
            ? previous
            : { movieId: selectedMovieId, mode: nextMode }
        );
        setSelectedDate(nextDate);
        if (nextDate && routeDate !== nextDate) {
          navigate(`/${selectedRegion}/${encodeURIComponent(selectedMovieId)}/${encodeURIComponent(nextDate)}`);
        }
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
  }, [navigate, selectedMovieId, selectedRegion]);

  useEffect(() => {
    if (!selectedMovieId || !routeDate || selectedDateValue !== routeDate) return;

    const routeDateMode = Object.keys(datesBySalesMode).find((mode) =>
      datesBySalesMode[mode].includes(routeDate)
    );
    if (!routeDateMode || datesBySalesMode[salesView].includes(routeDate)) return;

    setSalesModeState((previous) =>
      previous.movieId === selectedMovieId && previous.mode === routeDateMode
        ? previous
        : { movieId: selectedMovieId, mode: routeDateMode }
    );
  }, [datesBySalesMode, routeDate, salesView, selectedDateValue, selectedMovieId]);

  const shouldFetchDashboard = Boolean(selectedRegion && selectedMovie && selectedDate);
  const selectedModeDates = datesBySalesMode[salesView] || [];
  const salesModeOptions = useMemo(() => [
    { value: 'total', label: 'Current sales', mobileLabel: 'Current Sales', disabled: datesBySalesMode.total.length === 0 },
    { value: 'advance', label: 'Advance sales', mobileLabel: 'Advance Sales', disabled: datesBySalesMode.advance.length === 0 }
  ], [datesBySalesMode.advance.length, datesBySalesMode.total.length]);
  const comingSoonMovies = movies.filter((movie) => movie.lifecycleStatus === 'coming_soon');
  const currentMovies = movies.filter((movie) => movie.lifecycleStatus === 'now_playing');
  const oldMovies = movies.filter((movie) => movie.lifecycleStatus === 'ended');
  const activeMovieShelf = movieShelf;
  const displayedMovies = {
    coming_soon: comingSoonMovies,
    now_playing: currentMovies,
    ended: oldMovies
  }[activeMovieShelf];
  const orderedDisplayedMovies = [...displayedMovies].sort((a, b) => {
    if (activeMovieShelf === 'coming_soon') {
      return String(a.firstDate || '9999-12-31').localeCompare(String(b.firstDate || '9999-12-31'))
        || a.name.localeCompare(b.name);
    }
    return String(b.latestDate || '').localeCompare(String(a.latestDate || ''))
      || a.name.localeCompare(b.name);
  });
  const searchedMovies = orderedDisplayedMovies.filter((movie) =>
    movie.name.toLowerCase().includes(movieSearch.trim().toLowerCase())
  );

  const dashboardData = useAnalyticsV2({
    diffMode,
    grossMode: indiaGrossMode,
    salesMode: salesView,
    region: selectedRegion || 'usa',
    movieSlug: selectedMovieId,
    showDate: selectedDateValue,
    includeDifferences: selectedRegion === 'india'
      ? showIndiaGrowth && salesGrowthEnabled
      : showUsGrowth && salesGrowthEnabled,
    enabled: shouldFetchDashboard,
    refreshKey: selectedRegion === 'india' ? indiaRefreshKey : reloadKey
  });

  const indiaDashboardData = dashboardData;
  const {
    loading,
    kpis,
    tables,
    metadata,
    error,
    rawRows,
    historyData,
    differences,
    lastLiveUpdate
  } = dashboardData;
  const includeDifferences = selectedRegion === 'india' ? showIndiaGrowth : showUsGrowth;
  const growthAvailable = salesGrowthEnabled && metadata?.growthEnabled !== false;
  const dashboardHistoryData = growthAvailable ? historyData || EMPTY_ARRAY : EMPTY_ARRAY;

  const dashboardIsCurrent = metadata?.movieSlug === selectedMovieId
    && metadata?.showDate === selectedDateValue
    && metadata?.salesMode === salesView;
  const dashboardLoading = loading || (!dashboardIsCurrent && !error);
  const openingDashboard = Boolean(
    selectedRegion &&
    selectedMovie &&
    (dateLoading || (shouldFetchDashboard && dashboardLoading))
  );
  const routeContentLoading = movieLoading || dateLoading || openingDashboard || (shouldFetchDashboard && dashboardLoading);

  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showLiveUpdate, setShowLiveUpdate] = useState(false);
  const liveUpdateSessionStartRef = useRef(Date.now());
  const [filters, setFilters] = useState({
    state: [],
    chain: [],
    theater: [],
    format: [],
    language: [],
    timeCat: [],
    timeStart: '',
    timeEnd: ''
  });

  useEffect(() => {
    document.documentElement.classList.toggle('is-route-loading', routeContentLoading || homeTransitionLoading);
  }, [homeTransitionLoading, routeContentLoading]);

  useEffect(() => {
    if (!homeTransitionLoading) return undefined;

    const timeoutId = window.setTimeout(() => setHomeTransitionLoading(false), 520);
    return () => window.clearTimeout(timeoutId);
  }, [homeTransitionLoading]);

  useEffect(() => () => {
    document.documentElement.classList.remove('is-route-loading');
    document.documentElement.classList.remove('theme-transitioning-to-light', 'theme-transitioning-to-dark');
    window.clearTimeout(themeTransitionTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!lastLiveUpdate || selectedRegion !== 'usa') {
      setShowLiveUpdate(false);
      return undefined;
    }

    const updateTimestamp = Number(lastLiveUpdate);
    if (!Number.isFinite(updateTimestamp) || updateTimestamp <= liveUpdateSessionStartRef.current) {
      return undefined;
    }

    const expiresAt = Date.now() + 6000;
    const hideIfExpired = () => {
      if (Date.now() >= expiresAt) setShowLiveUpdate(false);
    };

    setShowLiveUpdate(true);
    const timeoutId = setTimeout(hideIfExpired, 6000);
    document.addEventListener('visibilitychange', hideIfExpired);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', hideIfExpired);
    };
  }, [lastLiveUpdate, selectedRegion]);

  const allRows = rawRows || EMPTY_ARRAY;

  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      if (r.is_extra || r.t_id === 'EXTRA') return false;
      if (filters.state.length && !filters.state.includes(r.state)) return false;
      if (filters.chain.length && !filters.chain.includes(r.chain)) return false;
      if (filters.theater.length && !filters.theater.includes(r.theater)) return false;
      if (filters.format.length && !filters.format.includes(r.format)) return false;
      if (filters.language.length && !filters.language.includes(r.language)) return false;
      const matchesTime = filters.timeCat.length === 0 || filters.timeCat.some((timeCategory) =>
        timeCategory === CUSTOM_TIME_RANGE
          ? isTimeInRange(r.time, filters.timeStart, filters.timeEnd)
          : r.timeCat === timeCategory
      );
      if (!matchesTime) return false;
      return true;
    });
  }, [allRows, filters]);

  const noFiltersSelected = Object.entries(filters).every(([key, value]) => {
    if (key === 'timeStart' || key === 'timeEnd') return value === '';
    return Array.isArray(value) ? value.length === 0 : value === 'ALL';
  });

  const filteredSummary = useMemo(() => {
    if (noFiltersSelected) return null;

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
      if (isExtra) return;

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
  }, [filteredRows, noFiltersSelected]);
  const displayedKpis = noFiltersSelected ? kpis : filteredSummary.kpis;
  const displayedTables = noFiltersSelected ? tables : filteredSummary.tables;

  const handleExportImage = async () => {
    if (isGeneratingImg) return;
    setIsGeneratingImg(true);
    try {
      const { generateImageReport } = await import('./utils/imageGenerator');
      const dataUrl = await generateImageReport(kpis, tables, metadata, selectedMovie?.name, {
        showGrowth: showUsGrowth && growthAvailable && metadata?.growthEnabled === true,
        diffMode,
        salesMode: salesView
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      const filePart = (value) => String(value || 'unknown').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
      a.download = `${filePart(selectedMovie?.name)}_${filePart(REGION_META[selectedRegion]?.label)}_${filePart(selectedDateValue)}.png`;
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
    window.scrollTo(0, 0);
    const isSameRegion = selectedRegion === key;
    const cachedMovies = sessionProcessedMovieCache.get(key);
    setHomeTransitionLoading(false);
    setSelectedRegion(key);
    if (!isSameRegion) {
      setMovies(cachedMovies || []);
      setMovieShelf('now_playing');
    }
    setMovieSearch('');
    setMovieError(null);
    setSelectedMovie(null);
    setDates([]);
    setDatesBySalesMode({ total: [], advance: [] });
    setDateError(null);
    setSelectedDate(null);
    setMovieLoading(!isSameRegion && !cachedMovies);
    setDateLoading(false);
    navigate(`/${key}`);
  };

  const handleHome = () => {
    window.scrollTo(0, 0);
    setHomeTransitionLoading(Boolean(selectedRegion));
    setSelectedDate(null);
    setSelectedMovie(null);
    setSelectedRegion(null);
    setMovieSearch('');
    navigate('/');
  };

  const handleDateChange = useCallback((date) => {
    if (!date || !selectedRegion || !selectedMovieId) return;

    const dateChanged = date !== selectedDateValue;
    const routeChanged = date !== routeDate;
    if (!dateChanged && !routeChanged) return;

    if (dateChanged) setSelectedDate(date);
    if (routeChanged) {
      navigate(`/${selectedRegion}/${encodeURIComponent(selectedMovieId)}/${encodeURIComponent(date)}`);
    }
  }, [navigate, routeDate, selectedDateValue, selectedMovieId, selectedRegion]);

  const handleSalesViewChange = useCallback((nextSalesView) => {
    if (nextSalesView === salesView) return;

    const nextDates = datesBySalesMode[nextSalesView] || [];
    if (!nextDates.length) return;

    setSalesModeState({ movieId: selectedMovieId, mode: nextSalesView });
    const nextDate = nextDates.includes(selectedDateValue)
      ? selectedDateValue
      : getDefaultDateForSalesMode(
        nextDates,
        nextSalesView,
        getMarketToday(selectedRegion)
      );
    if (nextDate !== selectedDateValue) handleDateChange(nextDate);
  }, [datesBySalesMode, handleDateChange, salesView, selectedDateValue, selectedMovieId, selectedRegion]);

  const handleChangeMovie = useCallback(() => {
    setSelectedDate(null);
    setSelectedMovie(null);
    navigate(`/${selectedRegion}`);
  }, [navigate, selectedRegion]);

  const handleIndiaReload = useCallback(() => {
    setIndiaRefreshKey((value) => value + 1);
  }, []);

  const siteHeader = (
    <SiteHeader
      theme={theme}
      onToggleTheme={toggleTheme}
      onHome={handleHome}
      onSelectRegion={handleSelectRegion}
      selectedRegion={selectedRegion}
    />
  );

  const renderDashboard = () => {
    if (dashboardLoading) {
      return (
        <>
          {siteHeader}
          <main className="site-main dashboard-loading">
            <LoadingState label={`Loading ${regionTitle} data`} />
          </main>
        </>
      );
    }

    if (selectedRegion === 'india') {
      return (
        <>
          {siteHeader}
          <Suspense fallback={<main className="site-main dashboard-loading"><LoadingState label="Loading India dashboard" /></main>}>
            <IndiaAnalyticsDashboard
              data={indiaDashboardData}
              salesView={salesView}
              movieName={selectedMovie?.name || prettifySlug(selectedMovieId)}
              showDate={selectedDateValue}
              dates={selectedModeDates}
              salesModeOptions={salesModeOptions}
              onSalesViewChange={handleSalesViewChange}
              onDateChange={handleDateChange}
              onChangeMovie={handleChangeMovie}
              onReload={handleIndiaReload}
              growthVisible={showIndiaGrowth && growthAvailable}
              onGrowthVisibleChange={setShowIndiaGrowth}
              grossMode={indiaGrossMode}
              onGrossModeChange={setIndiaGrossMode}
              loadNextDetailPage={indiaDashboardData.loadNextDetailPage}
              hasMoreDetails={indiaDashboardData.hasMoreDetails}
              loadNextDimensionPage={indiaDashboardData.loadNextDimensionPage}
              hasMoreDimensionRows={indiaDashboardData.hasMoreDimensionRows}
              loadingDetails={indiaDashboardData.loadingDetails}
              loadingDimension={indiaDashboardData.loadingDimension}
              changeCounts={indiaDashboardData.changeCounts}
              loadingChangeType={indiaDashboardData.loadingChangeType}
              hasMoreChanges={indiaDashboardData.hasMoreChanges}
              loadMoreChanges={indiaDashboardData.loadMoreChanges}
            />
          </Suspense>
        </>
      );
    }

    if (error) {
      return (
        <>
          {siteHeader}
          <main className="site-main">
            <div className="dashboard-error" role="alert">Unable to load the dashboard: {error}</div>
          </main>
        </>
      );
    }

    return (
      <>
        {siteHeader}
        {showLiveUpdate && (
          <div className="live-update-demo-banner" role="status" aria-live="polite">
            <span className="live-update-demo-icon" aria-hidden="true">&#10003;</span>
            <span>
              <strong>Live data updated</strong>
              <small>Your dashboard is up to date</small>
            </span>
          </div>
        )}
        <main key={`report-${selectedRegion}-${selectedMovieId}`} className="site-main dashboard-page usa-dashboard-page">
        <div className="container">
          <DashboardHeader
            marketLabel={`${REGION_META[selectedRegion]?.label} BOX OFFICE`}
            movieName={selectedMovie?.name || prettifySlug(selectedMovieId)}
            showDate={selectedDateValue}
            dateOptions={selectedModeDates}
            onDateChange={handleDateChange}
            salesMode={salesView}
            salesModeOptions={salesModeOptions}
            onSalesModeChange={handleSalesViewChange}
            lastUpdated={metadata
              ? `${metadata.lastUpdated} IST${showUsGrowth && growthAvailable && metadata.growthEnabled && metadata.growthSince && metadata.growthSince !== 'N/A' ? ` • Growth since ${metadata.growthSince} IST` : ''}`
              : 'N/A'}
            moviePosterUrl={metadata?.posterUrl || DEFAULT_MOVIE_POSTER_URL}
            rightActionsClassName="usa-dashboard-right-actions"
            leftActions={[
              { label: 'Change Movie', onClick: () => {
                  setSelectedMovie(null);
                  setSelectedDate(null);
                  navigate(`/${selectedRegion}`);
                }, variant: 'secondary', mobileLabel: 'Change Movie' },
              { label: 'Reload Data', onClick: () => setReloadKey((value) => value + 1), variant: 'secondary', mobileLabel: 'Reload Data' }
            ]}
            rightActions={[
              { label: showFilters ? 'Hide Filters' : 'Show Filters', onClick: () => setShowFilters((v) => !v), variant: 'secondary', isActive: showFilters, mobileLabel: 'Filters', mobileIcon: 'filter' },
              { label: 'Growth', ariaLabel: showUsGrowth ? 'Hide growth details' : 'Show growth details', onClick: () => setShowUsGrowth((value) => !value), variant: 'secondary', disabled: !growthAvailable, isActive: showUsGrowth && growthAvailable, neutralHoverWhenInactive: true, activeStyle: 'dashboard-action-btn--growth-active', mobileLabel: 'Growth', mobileIcon: 'growth' },
              { label: isGeneratingImg ? 'Generating...' : 'Export Image', onClick: handleExportImage, variant: 'primary', disabled: isGeneratingImg, mobileLabel: isGeneratingImg ? 'Wait' : 'Export', mobileIcon: 'export' }
            ]}
          />

          {allRows.length > 0 && (
            <FilterPanel
              rawRows={allRows}
              filters={filters}
              setFilters={setFilters}
              showFilters={showFilters}
              diffMode={diffMode}
              onDiffModeChange={setDiffMode}
            />
          )}

          <Fragment key={`${selectedDateValue}-${salesView}`}>
            <KPIGrid kpis={displayedKpis} showGrowth={showUsGrowth && growthAvailable} />

            <div className="dashboard-row">
              {displayedTables?.formats && <DataTable
                title="Format Breakdown"
                data={displayedTables.formats}
                isFormat
                showGrowth={showUsGrowth && growthAvailable}
                totalCount={dashboardData.dimensionCounts?.formats}
                hasMore={dashboardData.hasMoreDimensionRows('formats')}
                loadingMore={dashboardData.loadingDimension === 'formats'}
                onLoadMore={() => dashboardData.loadNextDimensionPage('formats')}
              />}
              {displayedTables?.languages && <DataTable
                title="Language Breakdown"
                data={displayedTables.languages}
                isLanguage
                showGrowth={showUsGrowth && growthAvailable}
                totalCount={dashboardData.dimensionCounts?.languages}
                hasMore={dashboardData.hasMoreDimensionRows('languages')}
                loadingMore={dashboardData.loadingDimension === 'languages'}
                onLoadMore={() => dashboardData.loadNextDimensionPage('languages')}
              />}
            </div>

            <div className="dashboard-row">
              {displayedTables?.states && <DataTable
                title="State Breakdown"
                data={displayedTables.states}
                isState
                showGrowth={showUsGrowth && growthAvailable}
                totalCount={dashboardData.dimensionCounts?.states}
                hasMore={dashboardData.hasMoreDimensionRows('states')}
                loadingMore={dashboardData.loadingDimension === 'states'}
                onLoadMore={() => dashboardData.loadNextDimensionPage('states')}
              />}
              <section className="summary-section">
                <h2>Theatre-Level Breakdown</h2>
                <p>Theatre rankings are available on demand.</p>
                <button type="button" className="toggle-btn" onClick={() => setUsTheatersContext(
                  showUsTheaters ? '' : dashboardContextKey
                )}>
                  {showUsTheaters ? 'Hide Theatres' : 'Show Theatre Breakdown'}
                </button>
              </section>
            </div>

            <div className="dashboard-row">
              <DataTable
                title="Theatre Chain Breakdown"
                data={displayedTables?.chains || []}
                showGrowth={showUsGrowth && growthAvailable}
                totalCount={dashboardData.dimensionCounts?.chains}
                hasMore={dashboardData.hasMoreDimensionRows('chains')}
                loadingMore={dashboardData.loadingDimension === 'chains'}
                onLoadMore={() => dashboardData.loadNextDimensionPage('chains')}
              />
              <DataTable
                title="Time of Day Breakdown"
                data={displayedTables?.timeCats || []}
                showGrowth={showUsGrowth && growthAvailable}
                totalCount={dashboardData.dimensionCounts?.time_buckets}
                hasMore={dashboardData.hasMoreDimensionRows('time_buckets')}
                loadingMore={dashboardData.loadingDimension === 'time_buckets'}
                onLoadMore={() => dashboardData.loadNextDimensionPage('time_buckets')}
              />
            </div>

            {showUsTheaters && (
              <div className="dashboard-row" style={{ gridTemplateColumns: '1fr' }}>
                <DataTable
                  title="Theatre Breakdown"
                  data={displayedTables?.theaters || []}
                  isTheater
                  showGrowth={showUsGrowth && growthAvailable}
                  totalCount={dashboardData.dimensionCounts?.theaters}
                  hasMore={dashboardData.hasMoreDimensionRows('theaters')}
                  loadingMore={dashboardData.loadingDimension === 'theaters'}
                  onLoadMore={() => dashboardData.loadNextDimensionPage('theaters')}
                />
              </div>
            )}

            <section className="summary-section deep-dive-opt-in">
              <h2>Show-Level Deep Dive</h2>
              <p>Detailed show records are fetched only when requested, 20 at a time.</p>
              {!showUsDetails && (
                <button
                  type="button"
                  className="toggle-btn"
                  disabled={!dashboardData.detailsAvailable || dashboardData.loadingDetails}
                  onClick={() => {
                    setUsDetailsContext(dashboardContextKey);
                    dashboardData.loadNextDetailPage();
                  }}
                >
                  {dashboardData.loadingDetails ? 'Loading first 20 shows...' : 'Load Show Details'}
                </button>
              )}
            </section>
            {showUsDetails && (
              <div className="dashboard-row" style={{ gridTemplateColumns: '1fr' }}>
                <ShowsTable
                  rows={filteredRows}
                  hasMore={dashboardData.hasMoreDetails}
                  loadingMore={dashboardData.loadingDetails}
                  onLoadMore={dashboardData.loadNextDetailPage}
                />
              </div>
            )}

            {dashboardHistoryData && dashboardHistoryData.length > 0 && (
              <div className="dashboard-row" style={{ gridTemplateColumns: '1fr' }}>
                <HistoryTable data={dashboardHistoryData} />
              </div>
            )}

            {dashboardHistoryData && dashboardHistoryData.length > 0 && (
              <div className="dashboard-row" style={{ gridTemplateColumns: '1fr' }}>
                <Suspense fallback={null}>
                  <PacingChart historyData={dashboardHistoryData} />
                </Suspense>
              </div>
            )}

            {includeDifferences && differences && (
              <div className="differences-container" style={{ marginTop: '40px' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '10px' }}>
                  Difference Details ({diffMode === 'hourly' ? 'Since Previous Report' : 'Daily'})
                </h2>
                <div className="dashboard-row">
                  <DifferenceTable
                    title="New Shows Added"
                    data={differences.addedShows}
                    type="added"
                    totalCount={dashboardData.changeCounts?.added}
                    hasMore={dashboardData.hasMoreChanges('added')}
                    loadingMore={dashboardData.loadingChangeType === 'added'}
                    disabled={Boolean(dashboardData.loadingChangeType)}
                    onLoadMore={() => dashboardData.loadMoreChanges('added')}
                  />
                  <DifferenceTable
                    title="Shows Cancelled/Removed"
                    data={differences.removedShows}
                    type="removed"
                    totalCount={dashboardData.changeCounts?.removed}
                    hasMore={dashboardData.hasMoreChanges('removed')}
                    loadingMore={dashboardData.loadingChangeType === 'removed'}
                    disabled={Boolean(dashboardData.loadingChangeType)}
                    onLoadMore={() => dashboardData.loadMoreChanges('removed')}
                  />
                </div>
                <div className="dashboard-row">
                  <DifferenceTable
                    title="Existing Shows Tickets Growth"
                    data={differences.increasedShows}
                    type="booked"
                    totalCount={dashboardData.changeCounts?.tickets_increased}
                    hasMore={dashboardData.hasMoreChanges('tickets_increased')}
                    loadingMore={dashboardData.loadingChangeType === 'tickets_increased'}
                    disabled={Boolean(dashboardData.loadingChangeType)}
                    onLoadMore={() => dashboardData.loadMoreChanges('tickets_increased')}
                  />
                  <DifferenceTable
                    title="Existing Shows Cancelled Tickets"
                    data={differences.decreasedShows}
                    type="cancelled"
                    totalCount={dashboardData.changeCounts?.tickets_decreased}
                    hasMore={dashboardData.hasMoreChanges('tickets_decreased')}
                    loadingMore={dashboardData.loadingChangeType === 'tickets_decreased'}
                    disabled={Boolean(dashboardData.loadingChangeType)}
                    onLoadMore={() => dashboardData.loadMoreChanges('tickets_decreased')}
                  />
                </div>
              </div>
            )}
          </Fragment>

          <div className="footer">
            @TheWkndCinema • Data from Fandango • Excluding blocked seats.
          </div>
        </div>
        </main>
      </>
    );
  };

  if (openingDashboard && selectedRegion) {
    return (
      <>
        {siteHeader}
        <main className="site-main dashboard-loading">
          <LoadingState label={`Loading ${regionTitle} data`} />
        </main>
      </>
    );
  }

  if (!selectedRegion) {
    return (
      <div className="site-frame">
        {siteHeader}
        <main key="home" className="site-main home-page">
          <section className="home-hero">
            <div className="home-hero-copy">
              <div className="eyebrow"><span /> THE BOX OFFICE, IN FOCUS</div>
              <h1>Every ticket tells<br /><span>a bigger story.</span></h1>
              <p>
                Follow the numbers behind the movies. Explore live ticket sales,
                showtimes, occupancy and market momentum across India and the US.
              </p>
            </div>
            <div className="home-hero-actions">
              <button type="button" className="button-primary" onClick={() => handleSelectRegion('india')}>
                Explore the Box Office
                <span aria-hidden="true">↗</span>
              </button>
              <span className="home-updated-note"><span /> Live market data</span>
            </div>
            <div className="home-hero-art" aria-hidden="true">
              <div className="hero-orbit hero-orbit-outer" />
              <div className="hero-orbit hero-orbit-inner" />
              <div className="hero-ticket">
                <img className="hero-ticket-logo" src="/appicon.png" alt="" />
                <span className="hero-ticket-label">WEEKEND REPORT</span>
                <strong>BOX<br />OFFICE</strong>
                <span className="hero-ticket-rule" />
                <span className="hero-ticket-footer">THE NUMBERS BEHIND THE MOVIES</span>
              </div>
              <span className="hero-spark hero-spark-one">✦</span>
              <span className="hero-spark hero-spark-two">✦</span>
            </div>
            <div className="home-hero-index"><span>01</span> / MARKET OVERVIEW</div>
          </section>

          <section className="market-section" aria-labelledby="market-heading">
            <div className="section-heading">
              <div>
                <div className="eyebrow">PICK YOUR FRONT ROW</div>
                <h2 id="market-heading">Choose a market</h2>
              </div>
              <p>One destination for the latest box-office pulse.</p>
            </div>
            <div className="selection-grid selection-grid-markets">
              {Object.entries(REGION_META).map(([key, meta], index) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectRegion(key)}
                  className={`selection-card market-card market-card-${key}`}
                >
                  <span className="market-card-index">0{index + 1} / MARKET</span>
                  <span className="market-card-title">{meta.label}</span>
                  <span className="market-card-description">{meta.description}. Track movies, dates and live performance.</span>
                  <span className="market-card-link">Explore market <span aria-hidden="true">↗</span></span>
                  <span className="market-card-watermark" aria-hidden="true">{key === 'usa' ? 'US' : 'IN'}</span>
                </button>
              ))}
            </div>
          </section>

          <footer className="site-footer">THE WKND CINEMA <span>•</span> BOX OFFICE IN FOCUS</footer>
        </main>
      </div>
    );
  }

  if (!selectedMovie) {
    return (
      <div className="site-frame">
        {siteHeader}
        <main key={`market-${selectedRegion}`} className="site-main selection-page">
          <div className="selection-breadcrumb"><button type="button" onClick={handleHome}>Overview</button><span>/</span><strong>{REGION_META[selectedRegion].label}</strong></div>
          <section className="selection-heading">
            <div>
              <div className="eyebrow">{REGION_META[selectedRegion].label} BOX OFFICE</div>
              <h1>Movies in focus<span>.</span></h1>
              <p>Choose a title to explore its show dates, ticket sales and market performance.</p>
            </div>
            <div className="selection-heading-aside">
              <span className="selection-heading-value">{movies.length.toString().padStart(2, '0')}</span>
              <span className="selection-heading-label">Titles tracked</span>
            </div>
          </section>

          {movieLoading ? (
            <div className="selection-state"><LoadingState label={`Loading ${REGION_META[selectedRegion].label} movies`} /></div>
          ) : movieError ? (
            <div className="selection-state selection-error" role="alert">{movieError}</div>
          ) : movies.length === 0 ? (
            <div className="selection-state">No movies found for {REGION_META[selectedRegion].label}.</div>
          ) : (
            <>
              <div className="movie-toolbar">
                <MovieShelfTabs
                  activeShelf={activeMovieShelf}
                  onShelfChange={setMovieShelf}
                  counts={{
                    comingSoon: comingSoonMovies.length,
                    nowPlaying: currentMovies.length,
                    archive: oldMovies.length
                  }}
                />
                <label className="movie-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={movieSearch}
                    onChange={(event) => setMovieSearch(event.target.value)}
                    placeholder="Find a movie"
                    aria-label="Search movies"
                  />
                </label>
              </div>

              {searchedMovies.length > 0 ? (
                <div className="selection-grid selection-grid-movies">
                  {searchedMovies.map((movie, index) => (
                    <button
                      key={movie.id}
                      type="button"
                      disabled={!movie.latestDate}
                      onClick={() => {
                        if (!movie.latestDate) return;
                        window.scrollTo(0, 0);
                        setDateLoading(true);
                        setDateError(null);
                        setDates([]);
                        setDatesBySalesMode({ total: [], advance: [] });
                        setSelectedDate(null);
                        setSelectedMovie(movie);
                        navigate(`/${selectedRegion}/${encodeURIComponent(movie.id)}`);
                      }}
                      className="selection-card movie-card"
                    >
                      <span className="movie-card-topline">
                        <span>{movie.lifecycleStatus === 'coming_soon' ? 'COMING SOON' : movie.lifecycleStatus === 'ended' ? 'IN THE ARCHIVE' : 'NOW PLAYING'}</span>
                        <span>{String(index + 1).padStart(2, '0')}</span>
                      </span>
                      <span className="movie-card-title">{movie.name}</span>
                      <span className="movie-card-latest">
                        {movie.releaseDate
                          ? (
                            <>
                              <span>{movie.lifecycleStatus === 'coming_soon' ? 'Releases' : 'Released'}</span>
                              <span>{movie.releaseDate}</span>
                            </>
                          )
                          : movie.latestDate
                            ? (
                              <>
                                <span>Latest tracked showdate</span>
                                <span>{movie.latestDate}</span>
                              </>
                            )
                            : 'Sales tracking begins when reports are available'}
                      </span>
                      <span className="movie-card-link">
                        {movie.latestDate ? 'View box-office report' : 'Report not available yet'}
                        <span aria-hidden="true">{movie.latestDate ? '↗' : '—'}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="selection-state">
                  {movieSearch.trim()
                    ? `No titles match “${movieSearch.trim()}”. Try another search.`
                    : activeMovieShelf === 'coming_soon'
                      ? 'No movies found.'
                      : activeMovieShelf === 'ended'
                        ? 'No archived titles found for this market.'
                        : 'No now-playing titles found for this market.'}
                </div>
              )}
            </>
          )}
          <footer className="site-footer">THE WKND CINEMA <span>•</span> {REGION_META[selectedRegion].label} MARKET</footer>
        </main>
      </div>
    );
  }

  if (!selectedDate) {
    return (
      <div className="site-frame">
        {siteHeader}
        <main key={`movie-${selectedRegion}-${selectedMovieId}`} className="site-main selection-page">
          <div className="selection-breadcrumb">
            <button type="button" onClick={handleHome}>Overview</button><span>/</span>
            <button type="button" onClick={() => navigate(`/${selectedRegion}`)}>{REGION_META[selectedRegion].label}</button><span>/</span>
            <strong>{selectedMovie.name}</strong>
          </div>
          <section className="selection-heading">
            <div>
              <div className="eyebrow">{REGION_META[selectedRegion].label} BOX OFFICE</div>
              <h1>{selectedMovie.name}<span>.</span></h1>
              <p>Opening the latest available box-office report.</p>
            </div>
          </section>
          {dateLoading || movieLoading || (!dateError && selectedModeDates.length > 0) ? (
            <div className="selection-state">
              {dateError
                ? <span className="selection-error" role="alert">{dateError}</span>
                : <LoadingState label="Loading the latest report" />}
            </div>
          ) : (
            <div className="selection-state">
              {dateError
                ? <span className="selection-error" role="alert">{dateError}</span>
                : dates.length === 0
                  ? 'No show dates are available for this movie.'
                  : `No ${salesView === 'advance' ? 'advance' : 'current sales'} report dates are available for this movie.`}
            </div>
          )}
        </main>
      </div>
    );
  }

  return renderDashboard();
}

export default App;