import { CUSTOM_TIME_RANGE } from '../utils/timeFilter';

export const TimeFilter = ({ timeCategories, filters, setFilters }) => {
  const isCustom = filters.timeCat === CUSTOM_TIME_RANGE;

  const updateTime = (changes) => {
    setFilters((previous) => ({ ...previous, ...changes }));
  };

  return (
    <div className={isCustom ? 'time-filter time-filter-custom' : 'time-filter'}>
      <div className="filter-label">Time Of Day</div>
      <select
        className="filter-select"
        value={filters.timeCat}
        onChange={(event) => updateTime({ timeCat: event.target.value })}
      >
        <option value="ALL">All Times</option>
        {timeCategories.map((category) => (
          <option key={category} value={category}>{category}</option>
        ))}
        <option value={CUSTOM_TIME_RANGE}>Custom Time Range</option>
      </select>

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