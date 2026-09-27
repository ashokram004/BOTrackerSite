import { CUSTOM_TIME_RANGE } from '../utils/timeFilter';
import { MultiSelectFilter } from './MultiSelectFilter';

export const TimeFilter = ({ timeCategories, filters, setFilters }) => {
  const isCustom = filters.timeCat.includes(CUSTOM_TIME_RANGE);

  const updateTime = (changes) => {
    setFilters((previous) => ({ ...previous, ...changes }));
  };

  return (
    <div className={isCustom ? 'time-filter time-filter-custom' : 'time-filter'}>
      <MultiSelectFilter
        label="Time Of Day"
        allLabel="All Times"
        options={[
          ...timeCategories.map((category) => ({ value: category, label: category })),
          { value: CUSTOM_TIME_RANGE, label: 'Custom Time Range' }
        ]}
        selectedValues={filters.timeCat}
        onChange={(timeCat) => updateTime({ timeCat })}
        exclusiveValues={[CUSTOM_TIME_RANGE]}
      />

      {isCustom && (
        <div className="custom-time-fields">
          <label>
            <span>From</span>
            <input
              className="filter-time-input"
              type="time"
              value={filters.timeStart}
              onChange={(event) => updateTime({ timeStart: event.target.value })}
            />
          </label>
          <label>
            <span>To</span>
            <input
              className="filter-time-input"
              type="time"
              value={filters.timeEnd}
              onChange={(event) => updateTime({ timeEnd: event.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
};