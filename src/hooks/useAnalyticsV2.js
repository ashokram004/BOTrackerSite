import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  get,
  limitToLast,
  onValue,
  orderByKey,
  query,
  ref
} from 'firebase/database';
import { database } from '../firebaseConfig';

const EMPTY_ARRAY = [];
const TABLE_DIMENSIONS = [
  'formats',
  'languages',
  'states',
  'cities',
  'regions',
  'platforms',
  'theaters',
  'chains',
  'time_buckets'
];

const getTimeCategory = (value) => {
  const text = String(value || '').trim().replace(/\s*o'clock\s*/gi, ':00 ');
  const match = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return 'Unknown Time';
  let hour = Number(match[1]);
  const meridiem = (match[3] || '').toUpperCase();
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  if (hour >= 5 && hour < 9) return 'Early Morning (5am-9am)';
  if (hour >= 9 && hour < 12) return 'Morning (9am-12pm)';
  if (hour >= 12 && hour < 16) return 'Afternoon (12pm-4pm)';
  if (hour >= 16 && hour < 20) return 'Evening (4pm-8pm)';
  if (hour >= 20) return 'Night (8pm-12am)';
  return 'Midnight (12am-5am)';
};

const getChain = (name) => {
  const theater = String(name || '').toUpperCase();
  if (theater.includes('AMC')) return 'AMC Theatres';
  if (theater.includes('CINEMARK') || theater.includes('CENTURY')) return 'Cinemark';
  if (theater.includes('REGAL')) return 'Regal Cinemas';
  if (theater.includes('MARCUS')) return 'Marcus Theatres';
  if (theater.includes('HARKINS')) return 'Harkins Theatres';
  if (theater.includes('APPLE CINEMAS')) return 'Apple Cinemas';
  return 'Other / Independents';
};

const makeKpis = (summary, diffMode, grossMode) => {
  const metrics = grossMode
    ? summary.gross_modes?.[grossMode]?.metrics || summary.metrics || {}
    : summary.metrics || {};
  const delta = diffMode === 'hourly'
    ? metrics.previous_run_delta || {}
    : metrics.daily_baseline_delta || {};
  return {
    totalGross: { val: Number(metrics.booked_gross || 0), delta: Number(delta.booked_gross || 0) },
    totalBooked: { val: Number(metrics.booked_tickets || 0), delta: Number(delta.booked_tickets || 0) },
    totalVenues: { val: Number(metrics.theater_count || 0), delta: Number(delta.theater_count || 0) },
    totalShows: { val: Number(metrics.show_count || 0), delta: Number(delta.show_count || 0) },
    occupancy: { val: Number(metrics.occupancy_rate || 0), capacity: Number(metrics.capacity_seats || 0) }
  };
};

const makeTableRows = (summary, dimension, diffMode, grossMode) => {
  const source = diffMode === 'daily'
    ? summary.comparison?.daily_baseline?.dimensions?.[dimension]
    : grossMode
      ? summary.gross_modes?.[grossMode]?.dimensions?.[dimension]
      : summary.dimensions?.[dimension];
  return (source?.top || EMPTY_ARRAY)
  .map((item) => ({
    id: item.id,
    name: item.name,
    shows: Number(item.show_count || 0),
    total: Number(item.capacity_seats || 0),
    booked: Number(item.booked_tickets || 0),
    gross: Number(item.booked_gross || 0),
    occ: Number(item.occupancy_rate || 0),
    d_gross: Number(item.gross_delta || 0)
  }));
};

const makeDetailRow = (id, row) => ({
  ...row,
  id,
  chain: getChain(row.theater),
  timeCat: getTimeCategory(row.time),
  occ: Number(row.total) > 0 ? Number(row.booked || 0) / Number(row.total) * 100 : 0
});

const applyIndiaGrossMode = (row, grossMode) => {
  if (!grossMode || !row.bms_sid || !row.district_sid) return row;
  const selected = { ...row };
  for (const metric of ['total_tickets', 'booked_tickets', 'total_gross', 'booked_gross']) {
    const value = row[`${grossMode}_${metric}`];
    if (value !== undefined && value !== null) selected[metric] = value;
  }
  const capacity = Number(selected.total_tickets || 0);
  selected.occupancy = capacity > 0
    ? Number(selected.booked_tickets || 0) / capacity * 100
    : 0;
  return selected;
};

const makeChangeRow = (row) => ({
  id: row.show_id,
  theater: row.theater_name,
  state: row.state_name,
  time: row.local_start_time,
  format: row.format_name,
  language: row.language_name,
  booked: Number(row.booked_tickets || 0),
  gross: Number(row.booked_gross || 0),
  diffBooked: Math.abs(Number(row.tickets_delta || 0)),
  diffGross: Math.abs(Number(row.gross_delta || 0))
});

const emptyData = {
  loading: true,
  kpis: null,
  tables: null,
  rawRows: [],
  historyData: [],
  metadata: null,
  error: null,
  differences: null,
  hasAdvanceSnapshot: false,
  detailsAvailable: false,
  detailPageCount: 0,
  loadedDetailPages: 0,
  loadingDetails: false
};

export const useAnalyticsV2 = ({
  enabled,
  region,
  movieSlug,
  showDate,
  salesMode = 'total',
  diffMode = 'daily',
  includeDifferences = false,
  grossMode = 'bms',
  refreshKey = 0
}) => {
  const [published, setPublished] = useState(null);
  const [summaryState, setSummaryState] = useState({ runId: null, value: null });
  const [details, setDetails] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [differences, setDifferences] = useState(null);
  const [comparisonPages, setComparisonPages] = useState({});
  const [loadingChangeType, setLoadingChangeType] = useState(null);
  const [error, setError] = useState(null);
  const [loadedDetailPages, setLoadedDetailPages] = useState(0);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [dimensionRows, setDimensionRows] = useState({});
  const [dimensionPages, setDimensionPages] = useState({});
  const [loadingDimension, setLoadingDimension] = useState(null);

  const runId = salesMode === 'advance'
    ? published?.advance_run_id || null
    : published?.active_run_id || null;
  const summary = summaryState.runId === runId ? summaryState.value : null;
  const dateRoot = `markets/${region}/movies/${movieSlug}/dates/${showDate}`;
  const activeDiffMode = region === 'india' ? 'hourly' : diffMode;
  const comparisonName = activeDiffMode === 'hourly' ? 'previous_run' : 'daily_baseline';
  const activeGrossMode = region === 'india' && summary?.gross_modes?.[grossMode]?.available
    ? grossMode
    : region === 'india' ? 'bms' : null;
  const selectedComparison = activeGrossMode
    ? summary?.gross_modes?.[activeGrossMode]?.comparison?.[comparisonName]
      || summary?.comparison?.[comparisonName]
    : summary?.comparison?.[comparisonName];
  const comparisonAvailable = Boolean(selectedComparison?.available);

  useEffect(() => {
    if (!enabled || !region || !movieSlug || !showDate) {
      return undefined;
    }

    return onValue(ref(database, `${dateRoot}/published`), (snapshot) => {
      const value = snapshot.val();
      const selectedRunId = salesMode === 'advance'
        ? value?.advance_run_id
        : value?.active_run_id;
      setPublished(value && typeof value === 'object' ? value : {});
      setSummaryState({ runId: selectedRunId || null, value: null });
      setDetails([]);
      setDifferences(null);
      setComparisonPages({});
      setLoadedDetailPages(0);
      setDimensionRows({});
      setDimensionPages({});
      if (!selectedRunId) {
        setError(salesMode === 'advance'
          ? 'No advance-sales snapshot is available for this movie and date.'
          : 'No V2 analytics have been published for this movie and date yet.');
      } else {
        setError(null);
      }
    }, (error) => {
      setError(error.message);
    });
  }, [dateRoot, enabled, movieSlug, refreshKey, region, salesMode, showDate]);

  useEffect(() => {
    if (!enabled || !runId) return undefined;
    const summaryPath = `${dateRoot}/analytics_v2/runs/${runId}/summary`;
    return onValue(ref(database, summaryPath), (snapshot) => {
      const value = snapshot.val();
      if (!value || typeof value !== 'object') {
        setError(`Published analytics summary is missing for run ${runId}.`);
        setSummaryState({ runId, value: null });
        return;
      }
      setError(null);
      setSummaryState({ runId, value });
    }, (error) => {
      setError(error.message);
    });
  }, [dateRoot, enabled, runId]);

  useEffect(() => {
    if (!enabled || !runId || !summary) return;
    let active = true;
    if (includeDifferences && comparisonAvailable) {
      const changePath = `${dateRoot}/analytics_v2/runs/${runId}/pages/comparisons/${comparisonName}`;
      const countByType = selectedComparison?.change_counts || {};
      const changeTypes = ['added', 'removed', 'tickets_increased', 'tickets_decreased'];
      Promise.all(changeTypes.map(async (type) => {
        if (!Number(countByType[type] || 0)) return [type, []];
        const modePath = activeGrossMode
          ? `${dateRoot}/analytics_v2/runs/${runId}/pages/gross_modes/${activeGrossMode}/comparisons/${comparisonName}`
          : changePath;
        const page = await get(ref(database, `${modePath}/${type}/0001`));
        const rows = page.val();
        return [type, Array.isArray(rows) ? rows.map(makeChangeRow) : []];
      })).then((entries) => {
        if (!active) return;
        const result = Object.fromEntries(entries);
        setDifferences({
          addedShows: result.added,
          removedShows: result.removed,
          increasedShows: result.tickets_increased,
          decreasedShows: result.tickets_decreased
        });
        setComparisonPages(Object.fromEntries(changeTypes.map((type) => [
          type,
          Number(countByType[type] || 0) ? 1 : 0
        ])));
      }).catch((error) => {
        if (active) setError(error.message);
      });
    }
    return () => {
      active = false;
    };
  }, [
    activeGrossMode,
    comparisonAvailable,
    comparisonName,
    dateRoot,
    enabled,
    includeDifferences,
    runId,
    summary,
    selectedComparison
  ]);

  useEffect(() => {
    if (!enabled || !includeDifferences || !comparisonAvailable) return undefined;
    let active = true;
    get(query(ref(database, `${dateRoot}/history`), orderByKey(), limitToLast(90)))
      .then((snapshot) => {
        if (!active) return;
        const history = snapshot.val();
        setHistoryData(history && typeof history === 'object'
          ? Object.values(history).filter((item) => item && typeof item === 'object')
            .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')))
          : []);
      })
      .catch((historyError) => {
        if (active) setError(historyError.message);
      });
    return () => {
      active = false;
    };
  }, [comparisonAvailable, dateRoot, enabled, includeDifferences]);

  const loadNextDetailPage = useCallback(async () => {
    if (!published || loadingDetails) return;
    const pageNumber = loadedDetailPages + 1;
    if (pageNumber > Number(published.detail_page_count || 0)) return;
    setLoadingDetails(true);
    setError(null);
    try {
      const pageRef = ref(
        database,
        `${dateRoot}/movie_details/runs/${runId}/pages/${String(pageNumber).padStart(4, '0')}`
      );
      const snapshot = await get(pageRef);
      const page = snapshot.val();
      if (!page || typeof page !== 'object') {
        throw new Error(`Show-detail page ${pageNumber} is unavailable.`);
      }
      const rows = Object.entries(page)
        .filter(([, row]) => row && !row.is_extra && row.t_id !== 'EXTRA')
        .map(([id, row]) => ({ id, row }));
      setDetails((previous) => [...previous, ...rows]);
      setLoadedDetailPages(pageNumber);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoadingDetails(false);
    }
  }, [dateRoot, loadedDetailPages, loadingDetails, published, runId]);

  const loadNextDimensionPage = useCallback(async (dimension) => {
    if (!summary || loadingDimension) return;
    const dimensionKey = `${activeGrossMode || 'default'}/${activeDiffMode}/${dimension}`;
    const source = activeDiffMode === 'daily'
      ? summary.comparison?.daily_baseline?.dimensions?.[dimension]
      : activeGrossMode
        ? summary.gross_modes?.[activeGrossMode]?.dimensions?.[dimension]
        : summary.dimensions?.[dimension];
    const pageCount = Number(source?.count || 0);
    const pageNumber = (dimensionPages[dimensionKey] || 1) + 1;
    if (pageNumber > Math.ceil(pageCount / 20)) return;
    setLoadingDimension(dimension);
    try {
      const pageSet = activeDiffMode === 'daily'
        ? 'daily_dimensions'
        : activeGrossMode
          ? `gross_modes/${activeGrossMode}`
          : 'dimensions';
      const snapshot = await get(ref(
        database,
        `${dateRoot}/analytics_v2/runs/${runId}/pages/${pageSet}/${dimension}/gross/${String(pageNumber).padStart(4, '0')}`
      ));
      const value = snapshot.val();
      const rows = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
      setDimensionRows((previous) => ({
        ...previous,
        [dimensionKey]: [
          ...(previous[dimensionKey] || makeTableRows(summary, dimension, activeDiffMode, activeGrossMode)),
          ...rows.map((item) => ({
            id: item.id,
            name: item.name,
            shows: Number(item.show_count || 0),
            total: Number(item.capacity_seats || 0),
            booked: Number(item.booked_tickets || 0),
            gross: Number(item.booked_gross || 0),
            occ: Number(item.occupancy_rate || 0),
            d_gross: Number(item.gross_delta || 0)
          }))
        ]
      }));
      setDimensionPages((previous) => ({ ...previous, [dimensionKey]: pageNumber }));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingDimension(null);
    }
  }, [activeDiffMode, activeGrossMode, dateRoot, dimensionPages, loadingDimension, runId, summary]);

  const loadMoreChanges = useCallback(async (type) => {
    if (!summary || loadingChangeType) return;
    const countByType = selectedComparison?.change_counts || {};
    const total = Number(countByType[type] || 0);
    const pageNumber = (comparisonPages[type] || 0) + 1;
    if (pageNumber > Math.ceil(total / 20)) return;
    setLoadingChangeType(type);
    try {
      const changeRoot = activeGrossMode
        ? `${dateRoot}/analytics_v2/runs/${runId}/pages/gross_modes/${activeGrossMode}/comparisons/${comparisonName}`
        : `${dateRoot}/analytics_v2/runs/${runId}/pages/comparisons/${comparisonName}`;
      const snapshot = await get(ref(database,
        `${changeRoot}/${type}/${String(pageNumber).padStart(4, '0')}`
      ));
      const value = snapshot.val();
      const rows = Array.isArray(value)
        ? value
        : value && typeof value === 'object'
          ? Object.values(value)
          : [];
      const keyByType = {
        added: 'addedShows',
        removed: 'removedShows',
        tickets_increased: 'increasedShows',
        tickets_decreased: 'decreasedShows'
      };
      setDifferences((previous) => ({
        ...previous,
        [keyByType[type]]: [
          ...(previous?.[keyByType[type]] || []),
          ...rows.map(makeChangeRow)
        ]
      }));
      setComparisonPages((previous) => ({ ...previous, [type]: pageNumber }));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingChangeType(null);
    }
  }, [activeGrossMode, comparisonName, comparisonPages, dateRoot, loadingChangeType, runId, selectedComparison, summary]);

  const dimensionCounts = useMemo(() => Object.fromEntries(TABLE_DIMENSIONS.map((dimension) => {
    const source = activeDiffMode === 'daily'
      ? summary?.comparison?.daily_baseline?.dimensions?.[dimension]
      : activeGrossMode
        ? summary?.gross_modes?.[activeGrossMode]?.dimensions?.[dimension]
        : summary?.dimensions?.[dimension];
    return [dimension, Number(source?.count || 0)];
  })), [activeDiffMode, activeGrossMode, summary]);

  const loading = Boolean(enabled && !error && (!published || !summary));
  const data = useMemo(() => ({
    ...emptyData,
    loading,
    kpis: summary ? makeKpis(summary, activeDiffMode, activeGrossMode) : null,
    tables: summary ? {
      formats: dimensionRows[`${activeGrossMode || 'default'}/${activeDiffMode}/formats`] || makeTableRows(summary, 'formats', activeDiffMode, activeGrossMode),
      languages: dimensionRows[`${activeGrossMode || 'default'}/${activeDiffMode}/languages`] || makeTableRows(summary, 'languages', activeDiffMode, activeGrossMode),
      states: dimensionRows[`${activeGrossMode || 'default'}/${activeDiffMode}/states`] || makeTableRows(summary, 'states', activeDiffMode, activeGrossMode),
      cities: dimensionRows[`${activeGrossMode || 'default'}/${activeDiffMode}/cities`] || makeTableRows(summary, 'cities', activeDiffMode, activeGrossMode),
      regions: dimensionRows[`${activeGrossMode || 'default'}/${activeDiffMode}/regions`] || makeTableRows(summary, 'regions', activeDiffMode, activeGrossMode),
      platforms: dimensionRows[`${activeGrossMode || 'default'}/${activeDiffMode}/platforms`] || makeTableRows(summary, 'platforms', activeDiffMode, activeGrossMode),
      theaters: dimensionRows[`${activeGrossMode || 'default'}/${activeDiffMode}/theaters`] || makeTableRows(summary, 'theaters', activeDiffMode, activeGrossMode),
      chains: dimensionRows[`${activeGrossMode || 'default'}/${activeDiffMode}/chains`] || makeTableRows(summary, 'chains', activeDiffMode, activeGrossMode),
      timeCats: dimensionRows[`${activeGrossMode || 'default'}/${activeDiffMode}/time_buckets`] || makeTableRows(summary, 'time_buckets', activeDiffMode, activeGrossMode)
    } : null,
    rawRows: details.map(({ id, row }) =>
      makeDetailRow(id, region === 'india' ? applyIndiaGrossMode(row, activeGrossMode) : row)
    ),
    historyData,
    metadata: summary ? {
      lastUpdated: summary.observed_at || 'N/A',
      growthSince: summary.comparison?.[comparisonName]?.observed_at || 'N/A',
      showDate,
      movieSlug,
      salesMode,
      growthEnabled: comparisonAvailable,
      currency: summary.currency
    } : null,
    error,
    differences,
    hasAdvanceSnapshot: Boolean(published?.advance_run_id),
    detailsAvailable: Boolean(published?.details_available),
    detailPageCount: Number(published?.detail_page_count || 0),
    loadedDetailPages,
    dimensionCounts,
    dimensionPages,
    loadingDetails,
    loadingDimension,
    grossModes: summary?.gross_modes || null,
    selectedGrossMode: activeGrossMode,
    lastLiveUpdate: published?.observed_at ? Date.parse(published.observed_at) : null
  }), [
    comparisonAvailable,
    comparisonName,
    details,
    region,
    activeGrossMode,
    dimensionCounts,
    dimensionPages,
    dimensionRows,
    activeDiffMode,
    differences,
    error,
    historyData,
    loadedDetailPages,
    loading,
    loadingDetails,
    loadingDimension,
    movieSlug,
    published,
    salesMode,
    showDate,
    summary
  ]);

  return {
    ...data,
    changeCounts: selectedComparison?.change_counts || {},
    comparisonPages,
    loadingChangeType,
    loadNextDetailPage,
    hasMoreDetails: loadedDetailPages < data.detailPageCount,
    loadNextDimensionPage,
    hasMoreDimensionRows: (dimension) =>
      (dimensionPages[`${activeGrossMode || 'default'}/${activeDiffMode}/${dimension}`] || 1) * 20
      < (dimensionCounts[dimension] || 0),
    loadMoreChanges,
    hasMoreChanges: (type) =>
      (comparisonPages[type] || 0) * 20
      < Number(selectedComparison?.change_counts?.[type] || 0)
  };
};
