import { memo, useMemo } from 'react';
import { TimeFilter } from './TimeFilter';
import { MultiSelectFilter } from './MultiSelectFilter';

export const FilterPanel = memo(({
  rawRows,
  filters,
  setFilters,
  showFilters,
  diffMode,
  onDiffModeChange
}) => {
  const uniqueValues = useMemo(() => {
    const rows = (rawRows || []).filter((r) => !(r.is_extra || r.t_id === 'EXTRA'));

    const normalizeValue = (value) => {
      const text = String(value ?? '').trim();
      if (!text) return null;
      const lowered = text.toLowerCase();
      if (lowered === 'extra' || lowered.includes('extra')) return null;
      return text;
    };

    const uniq = (arr) => [...new Set(arr.map(normalizeValue).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));

    const states = uniq(rows.map((r) => r.state));
    const chains = uniq(rows.map((r) => r.chain));
    const formats = uniq(rows.map((r) => r.format));
    const languages = uniq(rows.map((r) => r.language));
    const timeCats = uniq(rows.map((r) => r.timeCat));

    // dependent dropdown: theaters based on state + chain
    let filteredTheaters = rows;
    if (filters.state.length) filteredTheaters = filteredTheaters.filter((r) => filters.state.includes(r.state));
    if (filters.chain.length) filteredTheaters = filteredTheaters.filter((r) => filters.chain.includes(r.chain));
    const theaters = uniq(filteredTheaters.map((r) => r.theater));

    return { states, chains, formats, languages, timeCats, theaters };
  }, [rawRows, filters.chain, filters.state]);

  return (
    <div className={`filter-panel multi-select-panel ${!showFilters ? 'hidden' : ''}`}>
      <div className="filter-grid">
        <div className="multi-select-filter growth-comparison-filter">
          <label className="filter-label" htmlFor="growth-comparison-filter">
            Growth Comparison
          </label>
          <div className="filter-select-shell">
            <select
              id="growth-comparison-filter"
              className="filter-select"
              value={diffMode}
              onChange={(event) => onDiffModeChange?.(event.target.value)}
            >
              <option value="hourly">Since Previous Report</option>
              <option value="daily">Daily</option>
            </select>
            <span className="filter-select-arrow" aria-hidden="true">▾</span>
          </div>
        </div>

        <MultiSelectFilter
          label="State"
          allLabel="All States"
          selectedValues={filters.state}
          onChange={(state) => setFilters((previous) => ({ ...previous, state, theater: [] }))}
          options={uniqueValues.states.map((value) => ({ value, label: value }))}
        />

        <MultiSelectFilter
          label="Theatre Chain"
          allLabel="All Chains"
          selectedValues={filters.chain}
          onChange={(chain) => setFilters((previous) => ({ ...previous, chain, theater: [] }))}
          options={uniqueValues.chains.map((value) => ({ value, label: value }))}
        />

        <MultiSelectFilter
          label="Theatre"
          allLabel="All Theatres"
          selectedValues={filters.theater}
          onChange={(theater) => setFilters((previous) => ({ ...previous, theater }))}
          options={uniqueValues.theaters.map((value) => ({ value, label: value }))}
        />

        <MultiSelectFilter
          label="Format"
          allLabel="All Formats"
          selectedValues={filters.format}
          onChange={(format) => setFilters((previous) => ({ ...previous, format }))}
          options={uniqueValues.formats.map((value) => ({ value, label: value }))}
        />

        <MultiSelectFilter
          label="Language"
          allLabel="All Languages"
          selectedValues={filters.language}
          onChange={(language) => setFilters((previous) => ({ ...previous, language }))}
          options={uniqueValues.languages.map((value) => ({ value, label: value }))}
        />

        <TimeFilter
          timeCategories={uniqueValues.timeCats}
          filters={filters}
          setFilters={setFilters}
        />
      </div>
    </div>
  );
});
