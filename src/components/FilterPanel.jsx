import { useMemo } from 'react';

const Select = ({ label, value, onChange, options }) => {
  return (
    <div>
      <div className="filter-label">{label}</div>
      <select className="filter-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export const FilterPanel = ({
  rawRows,
  filters,
  setFilters,
  showFilters
}) => {
  const uniqueValues = useMemo(() => {
    const rows = rawRows || [];

    const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));

    const states = uniq(rows.map((r) => r.state));
    const chains = uniq(rows.map((r) => r.chain));
    const formats = uniq(rows.map((r) => r.format));
    const languages = uniq(rows.map((r) => r.language));
    const timeCats = uniq(rows.map((r) => r.timeCat));

    // dependent dropdown: theaters based on state + chain
    let filteredTheaters = rows;
    if (filters.state !== 'ALL') filteredTheaters = filteredTheaters.filter((r) => r.state === filters.state);
    if (filters.chain !== 'ALL') filteredTheaters = filteredTheaters.filter((r) => r.chain === filters.chain);
    const theaters = uniq(filteredTheaters.map((r) => r.theater));

    return { states, chains, formats, languages, timeCats, theaters };
  }, [rawRows, filters.chain, filters.state]);

  const opt = (list, labelAll) => [
    { value: 'ALL', label: labelAll },
    ...list.map((v) => ({ value: v, label: v }))
  ];

  return (
    <div className={`filter-panel ${!showFilters ? 'hidden' : ''}`}>
      <div className="filter-grid">
        <Select
          label="State"
          value={filters.state}
          onChange={(v) => setFilters((p) => ({ ...p, state: v }))}
          options={opt(uniqueValues.states, 'All States')}
        />

        <Select
          label="Theatre Chain"
          value={filters.chain}
          onChange={(v) => setFilters((p) => ({ ...p, chain: v }))}
          options={opt(uniqueValues.chains, 'All Chains')}
        />

        <Select
          label="Theatre"
          value={filters.theater}
          onChange={(v) => setFilters((p) => ({ ...p, theater: v }))}
          options={opt(uniqueValues.theaters, 'All Theatres')}
        />

        <Select
          label="Format"
          value={filters.format}
          onChange={(v) => setFilters((p) => ({ ...p, format: v }))}
          options={opt(uniqueValues.formats, 'All Formats')}
        />

        <Select
          label="Language"
          value={filters.language}
          onChange={(v) => setFilters((p) => ({ ...p, language: v }))}
          options={opt(uniqueValues.languages, 'All Languages')}
        />

        <Select
          label="Time Of Day"
          value={filters.timeCat}
          onChange={(v) => setFilters((p) => ({ ...p, timeCat: v }))}
          options={opt(uniqueValues.timeCats, 'All Times')}
        />
      </div>
    </div>
  );
};
