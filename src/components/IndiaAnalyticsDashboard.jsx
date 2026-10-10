import { memo, useMemo, useState } from 'react';
import { DataTable } from './DataTable';
import { DashboardHeader } from './DashboardHeader';
import { DifferenceTable } from './DifferenceTable';
import { HistoryTable } from './HistoryTable';
import { IndiaGrossGrowthChart } from './IndiaGrossGrowthChart';
import { MultiSelectFilter } from './MultiSelectFilter';
import { TimeFilter } from './TimeFilter';
import { CUSTOM_TIME_RANGE, isTimeInRange } from '../utils/timeFilter';

const GROSS_MODE_LABELS = {
  bms: 'BookMyShow',
  district: 'District',
  higher: 'Higher',
  lower: 'Lower',
  average: 'Average'
};

const getPlatform = (row) => {
  if (row.bms_sid && row.district_sid) return 'Merged';
  if (row.bms_sid) return 'BookMyShow';
  if (row.district_sid) return 'District';
  return row.sourceType || row.source || 'Unknown';
};

const getOccupancyTier = (occupancy) => {
  if (occupancy >= 100) return 'Sold Out';
  if (occupancy >= 80) return 'Almost Full';
  if (occupancy >= 50) return 'Fast Filling';
  return 'Available';
};

const uniqueOptions = (rows, field) => [...new Set(rows.map((row) => row[field] || 'Unknown'))]
  .sort((a, b) => String(a).localeCompare(String(b)));

const formatGrowth = (value, formatter) => {
  if (!value) return '';
  return `${value > 0 ? '+' : '-'}${formatter(Math.abs(value))}`;
};

const formatRupees = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

const DetailRows = memo(({ rows }) => (
  <section className="summary-section">
    <h2>Show-Level Deep Dive</h2>
    <div className="table-scroll table-scroll-wide" style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>State</th>
            <th>City</th>
            <th>Theatre</th>
            <th>Showtime</th>
            <th>Language</th>
            <th>Format</th>
            <th>Seats</th>
            <th>Booked</th>
            <th>Gross</th>
            <th>Occupancy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.state || 'Unknown'}</td>
              <td>{row.city || 'Unknown'}</td>
              <td>{row.venue || 'Unknown'}</td>
              <td>{row.showTime || row.normalized_show_time || 'Unknown'}</td>
              <td>{row.language || 'Unknown'}</td>
              <td>{row.format || 'Unknown'}</td>
              <td>{Number(row.total_tickets || 0).toLocaleString('en-IN')}</td>
              <td>{Number(row.booked_tickets || 0).toLocaleString('en-IN')}</td>
              <td>{formatRupees(row.booked_gross)}</td>
              <td>{Number(row.occupancy || 0).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
));

export const IndiaAnalyticsDashboard = memo(({
  data,
  movieName,
  showDate,
  salesView,
  dates,
  salesModeOptions,
  onSalesViewChange,
  onDateChange,
  onChangeMovie,
  onReload,
  growthVisible,
  onGrowthVisibleChange,
  grossMode,
  onGrossModeChange,
  loadNextDetailPage,
  hasMoreDetails,
  loadNextDimensionPage,
  hasMoreDimensionRows,
  loadingDetails,
  loadingDimension,
  changeCounts,
  loadingChangeType,
  hasMoreChanges,
  loadMoreChanges
}) => {
  const [theaterContext, setTheaterContext] = useState('');
  const [detailContext, setDetailContext] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    platform: [],
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
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const context = `${showDate}/${salesView}`;
  const showTheaters = theaterContext === context;
  const showDetails = detailContext === context;
  const metrics = data.kpis;
  const loadedRows = useMemo(() => data.rawRows || [], [data.rawRows]);
  const detailOptions = useMemo(() => ({
    platforms: [...new Set(loadedRows.map(getPlatform))].sort(),
    regions: uniqueOptions(loadedRows, 'region'),
    states: uniqueOptions(loadedRows, 'state'),
    cities: uniqueOptions(loadedRows, 'city'),
    theaters: uniqueOptions(loadedRows, 'venue'),
    formats: uniqueOptions(loadedRows, 'format'),
    languages: uniqueOptions(loadedRows, 'language'),
    timeCategories: [...new Set(loadedRows.map((row) => row.timeCat || 'Unknown Time'))].sort(),
    occupancyTiers: [...new Set(loadedRows.map((row) => getOccupancyTier(Number(row.occupancy || 0))))]
  }), [loadedRows]);
  const filteredRows = useMemo(() => loadedRows.filter((row) => {
    if (filters.platform.length && !filters.platform.includes(getPlatform(row))) return false;
    for (const [filterKey, rowKey] of [
      ['region', 'region'],
      ['state', 'state'],
      ['city', 'city'],
      ['theater', 'venue'],
      ['format', 'format'],
      ['language', 'language']
    ]) {
      if (filters[filterKey].length && !filters[filterKey].includes(row[rowKey] || 'Unknown')) return false;
    }
    const time = row.showTime || row.normalized_show_time || row.time || '';
    if (filters.timeCat.includes(CUSTOM_TIME_RANGE)) {
      if (!filters.timeStart || !filters.timeEnd || !isTimeInRange(time, filters.timeStart, filters.timeEnd)) return false;
    } else if (filters.timeCat.length && !filters.timeCat.includes(row.timeCat || 'Unknown Time')) {
      return false;
    }
    if (filters.occTier.length && !filters.occTier.includes(getOccupancyTier(Number(row.occupancy || 0)))) return false;
    return true;
  }), [filters, loadedRows]);

  const handleExportImage = async () => {
    setExporting(true);
    setExportError('');
    try {
      const { generateIndiaImageReport } = await import('../utils/imageGenerator');
      const image = await generateIndiaImageReport({
        movieName,
        showDate,
        salesView,
        showGrowth: growthVisible,
        growthSince: data.metadata?.growthSince || 'N/A',
        lastUpdated: data.metadata?.lastUpdated || 'N/A',
        totalGross: metrics?.totalGross?.val || 0,
        totalBooked: metrics?.totalBooked?.val || 0,
        totalVenues: metrics?.totalVenues?.val || 0,
        totalShows: metrics?.totalShows?.val || 0,
        totalTickets: metrics?.occupancy?.capacity || 0,
        occupancy: metrics?.occupancy?.val || 0,
        growthValues: {
          totalGross: formatGrowth(metrics?.totalGross?.delta, formatRupees),
          totalBooked: formatGrowth(metrics?.totalBooked?.delta, (value) => Number(value).toLocaleString('en-IN')),
          totalVenues: formatGrowth(metrics?.totalVenues?.delta, (value) => Number(value).toLocaleString('en-IN')),
          totalShows: formatGrowth(metrics?.totalShows?.delta, (value) => Number(value).toLocaleString('en-IN'))
        },
        languages: (data.tables?.languages || []).map((row) => ({ ...row, occupancy: row.occ })),
        timeCats: (data.tables?.timeCats || []).map((row) => ({ ...row, occupancy: row.occ })),
        states: (data.tables?.states || []).map((row) => ({ ...row, occupancy: row.occ })),
        cities: (data.tables?.cities || []).map((row) => ({ ...row, occupancy: row.occ }))
      });
      const link = document.createElement('a');
      link.href = image;
      link.download = `${movieName.replace(/[^a-z0-9]+/gi, '-')}-${showDate}-india-report.png`;
      link.click();
    } catch (error) {
      setExportError(`Could not export the report image: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  const table = (title, dimension, dataRows, props = {}) => (
    <DataTable
      key={`${dimension}-${data.selectedGrossMode || grossMode}`}
      title={title}
      data={dataRows || []}
      currency="INR"
      totalCount={data.dimensionCounts?.[dimension] || 0}
      hasMore={hasMoreDimensionRows(dimension)}
      loadingMore={loadingDimension === dimension}
      onLoadMore={() => loadNextDimensionPage(dimension)}
      showGrowth={growthVisible}
      {...props}
    />
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
          lastUpdated={data.metadata?.lastUpdated || 'N/A'}
          moviePosterUrl={data.posterUrl}
          leftActions={[
            { label: 'Change Movie', onClick: onChangeMovie, variant: 'secondary' },
            { label: 'Reload Data', onClick: onReload, variant: 'secondary' }
          ]}
          rightActions={[
            {
              label: exporting ? 'Generating Image...' : 'Export Image',
              onClick: handleExportImage,
              variant: 'primary',
              disabled: exporting,
              mobileLabel: exporting ? 'Exporting' : 'Export'
            },
            {
              label: growthVisible ? 'Hide Growth' : 'Show Growth',
              onClick: () => onGrowthVisibleChange((value) => !value),
              variant: 'secondary',
              isActive: growthVisible,
              mobileLabel: 'Growth'
            },
          ]}
        />
        {exportError && <div className="dashboard-error" role="alert">{exportError}</div>}

        <section className="summary-section" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <label htmlFor="india-gross-mode">Merged-show gross calculation</label>
          <select
            id="india-gross-mode"
            className="filter-select"
            value={data.selectedGrossMode || grossMode || 'bms'}
            onChange={(event) => onGrossModeChange(event.target.value)}
          >
            {Object.entries(data.grossModes || {})
              .filter(([, mode]) => mode.available)
              .map(([mode]) => (
                <option key={mode} value={mode}>{GROSS_MODE_LABELS[mode] || mode}</option>
              ))}
          </select>
          <span className="text-muted">Applies to merged BMS + District shows; exclusive shows keep their source values.</span>
        </section>

        <section className="kpi-grid us-kpi-grid">
          <div className="kpi-card">
            <div className="kpi-title">Booked Gross</div>
            <div className="kpi-value">{formatRupees(metrics?.totalGross?.val)}</div>
            {growthVisible && <div className="kpi-sub">{formatRupees(metrics?.totalGross?.delta)} growth</div>}
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Tickets Sold</div>
            <div className="kpi-value">{Number(metrics?.totalBooked?.val || 0).toLocaleString('en-IN')}</div>
            {growthVisible && <div className="kpi-sub">{Number(metrics?.totalBooked?.delta || 0).toLocaleString('en-IN')} growth</div>}
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Theatres</div>
            <div className="kpi-value">{Number(metrics?.totalVenues?.val || 0).toLocaleString('en-IN')}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Shows</div>
            <div className="kpi-value">{Number(metrics?.totalShows?.val || 0).toLocaleString('en-IN')}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Occupancy</div>
            <div className="kpi-value">{Number(metrics?.occupancy?.val || 0).toFixed(1)}%</div>
          </div>
        </section>

        <div className="dashboard-row">
          {table('State Breakdown', 'states', data.tables?.states, { isState: true })}
          {table('City Breakdown', 'cities', data.tables?.cities)}
        </div>
        <div className="dashboard-row">
          {table('Region / Circuit Breakdown', 'regions', data.tables?.regions)}
          {table('Format Breakdown', 'formats', data.tables?.formats, { isFormat: true })}
        </div>
        <div className="dashboard-row">
          {table('Language Breakdown', 'languages', data.tables?.languages, { isLanguage: true })}
          {table('Platform Breakdown', 'platforms', data.tables?.platforms)}
        </div>
        <div className="dashboard-row">
          {table('Time of Day Breakdown', 'time_buckets', data.tables?.timeCats)}
          <section className="summary-section">
            <h2>Theatre-Level Analysis</h2>
            <p>Theatre details are loaded only when requested.</p>
            <button type="button" className="toggle-btn" onClick={() => setTheaterContext(
              showTheaters ? '' : context
            )}>
              {showTheaters ? 'Hide Theatre Breakdown' : 'Show Theatre Breakdown'}
            </button>
          </section>
        </div>

        {showTheaters && (
          <div className="dashboard-row" style={{ gridTemplateColumns: '1fr' }}>
            {table('Theatre Breakdown', 'theaters', data.tables?.theaters, { isTheater: true })}
          </div>
        )}

        <section className="summary-section deep-dive-opt-in">
          <h2>Show-Level Deep Dive</h2>
          <p>Show-level records are fetched 20 at a time and are not downloaded with the dashboard summary.</p>
          {showDetails && loadedRows.length > 0 && (
            <>
              <p>Filters apply to the {loadedRows.length.toLocaleString('en-IN')} show records loaded so far, not to the full market totals.</p>
              <button type="button" className="toggle-btn" onClick={() => setShowFilters((value) => !value)}>
                {showFilters ? 'Hide Show Filters' : 'Filter Loaded Shows'}
              </button>
              {showFilters && (
                <div className="dashboard-row">
                  <MultiSelectFilter label="Platform" allLabel="All Platforms" options={detailOptions.platforms.map((value) => ({ value, label: value }))} selectedValues={filters.platform} onChange={(platform) => setFilters((previous) => ({ ...previous, platform }))} />
                  <MultiSelectFilter label="Region" allLabel="All Regions" options={detailOptions.regions.map((value) => ({ value, label: value }))} selectedValues={filters.region} onChange={(region) => setFilters((previous) => ({ ...previous, region }))} />
                  <MultiSelectFilter label="State" allLabel="All States" options={detailOptions.states.map((value) => ({ value, label: value }))} selectedValues={filters.state} onChange={(state) => setFilters((previous) => ({ ...previous, state }))} />
                  <MultiSelectFilter label="City" allLabel="All Cities" options={detailOptions.cities.map((value) => ({ value, label: value }))} selectedValues={filters.city} onChange={(city) => setFilters((previous) => ({ ...previous, city }))} />
                  <MultiSelectFilter label="Theatre" allLabel="All Theatres" options={detailOptions.theaters.map((value) => ({ value, label: value }))} selectedValues={filters.theater} onChange={(theater) => setFilters((previous) => ({ ...previous, theater }))} />
                  <MultiSelectFilter label="Format" allLabel="All Formats" options={detailOptions.formats.map((value) => ({ value, label: value }))} selectedValues={filters.format} onChange={(format) => setFilters((previous) => ({ ...previous, format }))} />
                  <MultiSelectFilter label="Language" allLabel="All Languages" options={detailOptions.languages.map((value) => ({ value, label: value }))} selectedValues={filters.language} onChange={(language) => setFilters((previous) => ({ ...previous, language }))} />
                  <TimeFilter timeCategories={detailOptions.timeCategories} filters={filters} setFilters={setFilters} />
                  <MultiSelectFilter label="Occupancy" allLabel="All Occupancies" options={detailOptions.occupancyTiers.map((value) => ({ value, label: value }))} selectedValues={filters.occTier} onChange={(occTier) => setFilters((previous) => ({ ...previous, occTier }))} />
                </div>
              )}
              <p>{filteredRows.length.toLocaleString('en-IN')} loaded shows match the selected filters.</p>
            </>
          )}
          {!showDetails && (
            <button
              type="button"
              className="toggle-btn"
              disabled={!data.detailsAvailable || loadingDetails}
              onClick={() => {
                setDetailContext(context);
                loadNextDetailPage();
              }}
            >
              {loadingDetails ? 'Loading first 20 shows...' : 'Load Show Details'}
            </button>
          )}
        </section>
        {showDetails && (
          <>
            <DetailRows rows={filteredRows} />
            {hasMoreDetails && (
              <div className="summary-section" style={{ textAlign: 'center' }}>
                <button type="button" className="toggle-btn" disabled={loadingDetails} onClick={loadNextDetailPage}>
                  {loadingDetails ? 'Loading...' : 'Load Next 20 Shows'}
                </button>
              </div>
            )}
          </>
        )}

        {growthVisible && data.historyData?.length > 0 && (
          <>
            <IndiaGrossGrowthChart historyData={data.historyData} grossMode={data.selectedGrossMode || 'bms'} />
            <div className="dashboard-row" style={{ gridTemplateColumns: '1fr' }}>
              <HistoryTable data={data.historyData} currency="INR" grossMode={data.selectedGrossMode || 'bms'} />
            </div>
          </>
        )}
        {growthVisible && data.differences && (
          <div className="dashboard-row">
            <DifferenceTable
              title="New Shows"
              data={data.differences.addedShows}
              type="added"
              totalCount={changeCounts?.added}
              hasMore={hasMoreChanges('added')}
              loadingMore={loadingChangeType === 'added'}
              disabled={Boolean(loadingChangeType)}
              onLoadMore={() => loadMoreChanges('added')}
            />
            <DifferenceTable
              title="Removed Shows"
              data={data.differences.removedShows}
              type="removed"
              totalCount={changeCounts?.removed}
              hasMore={hasMoreChanges('removed')}
              loadingMore={loadingChangeType === 'removed'}
              disabled={Boolean(loadingChangeType)}
              onLoadMore={() => loadMoreChanges('removed')}
            />
            <DifferenceTable
              title="Tickets Increased"
              data={data.differences.increasedShows}
              type="booked"
              totalCount={changeCounts?.tickets_increased}
              hasMore={hasMoreChanges('tickets_increased')}
              loadingMore={loadingChangeType === 'tickets_increased'}
              disabled={Boolean(loadingChangeType)}
              onLoadMore={() => loadMoreChanges('tickets_increased')}
            />
            <DifferenceTable
              title="Tickets Decreased"
              data={data.differences.decreasedShows}
              type="cancelled"
              totalCount={changeCounts?.tickets_decreased}
              hasMore={hasMoreChanges('tickets_decreased')}
              loadingMore={loadingChangeType === 'tickets_decreased'}
              disabled={Boolean(loadingChangeType)}
              onLoadMore={() => loadMoreChanges('tickets_decreased')}
            />
          </div>
        )}
        {data.error && <div className="dashboard-error" role="alert">{data.error}</div>}
      </div>
    </main>
  );
});
