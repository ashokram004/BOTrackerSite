export const DEFAULT_MOVIE_POSTER_URL = 'https://drive.google.com/thumbnail?id=15N4n9XlpRgxsAui3T7SQd02yZUMSmSLD&sz=w1000';

export const DashboardHeader = ({
  marketLabel = 'Box Office Tracking',
  movieName = '',
  showDate = '',
  lastUpdated = '',
  moviePosterUrl = DEFAULT_MOVIE_POSTER_URL,
  dateOptions = [],
  onDateChange,
  salesMode = 'total',
  salesModeOptions = [],
  onSalesModeChange,
  leftActions = [],
  rightActions = [],
  rightActionsClassName = ''
}) => {
  let [updatedValue, growthValue] = String(lastUpdated || '').split(' • Growth since ');
  updatedValue = updatedValue.toUpperCase();
  updatedValue = updatedValue.endsWith('IST') ? updatedValue : `${updatedValue} IST`;
  growthValue = growthValue ? growthValue.toUpperCase() : '';
  const hasGrowthValue = Boolean(
    growthValue &&
    !/^(n\/a|na|null|undefined|-)(\s|$)/i.test(growthValue.trim())
  );

  const renderActionButton = (action, index) => (
    <button
      key={action.key || `${action.label}-${index}`}
      type="button"
      className={`dashboard-action-btn ${action.variant === 'primary' ? 'primary' : action.variant === 'accent' ? 'accent' : 'secondary'}`}
      onClick={action.onClick}
      style={action.style}
      disabled={action.disabled}
      aria-pressed={action.isActive}
      aria-label={action.ariaLabel}
    >
      {action.label}
    </button>
  );

  const renderActions = (actions) => {
    const entries = [];
    actions.forEach((action, index) => {
      if (!action.group) {
        entries.push({ key: action.key || `${action.label}-${index}`, action, index });
        return;
      }

      const lastEntry = entries[entries.length - 1];
      if (lastEntry?.group === action.group) {
        lastEntry.actions.push({ action, index });
      } else {
        entries.push({
          key: action.group,
          group: action.group,
          label: action.groupLabel,
          description: action.groupDescription,
          actions: [{ action, index }]
        });
      }
    });

    return entries.map((entry) => entry.group
      ? (
        <div key={entry.key} className="dashboard-action-segment" role="group" aria-label={entry.label}>
          <span className="dashboard-action-segment-heading">
            <span className="dashboard-action-segment-label">{entry.label}</span>
            {entry.description && <span className="dashboard-action-segment-description">{entry.description}</span>}
          </span>
          {entry.actions.map(({ action, index }) => renderActionButton(action, index))}
        </div>
      )
      : renderActionButton(entry.action, entry.index));
  };

  return (
    <div className="dashboard-header-shell">
      <div className={`dashboard-header-main${hasGrowthValue ? '' : ' dashboard-header-main--single-update'}`}>
        <div className="dashboard-header-left">
          <div className="dashboard-header-movie-row">
            {moviePosterUrl && (
              <img
                className="dashboard-movie-poster"
                src={moviePosterUrl}
                alt={`${movieName} poster`}
              />
            )}
            <div className="dashboard-header-movie-copy">
              <div className="dashboard-header-label">{marketLabel}</div>
              <div className="dashboard-header-title">{movieName}</div>
            </div>
          </div>
          {(salesModeOptions.length > 0 || leftActions.length > 0) && (
            <div className="dashboard-header-movie-controls">
              {salesModeOptions.length > 0 && (
                <div className="dashboard-sales-mode" role="group" aria-label="Sales mode">
                  <div className="dashboard-sales-mode-options">
                    {salesModeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={option.disabled}
                        aria-pressed={salesMode === option.value}
                        onClick={() => onSalesModeChange?.(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {leftActions.length > 0 && (
                <div className="dashboard-header-movie-actions">
                  {renderActions(leftActions)}
                </div>
              )}
              {!hasGrowthValue && (
                <div className="dashboard-header-inline-update">
                  <span className="dashboard-header-label">Last Updated</span>
                  <span className="dashboard-header-meta">{updatedValue}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {hasGrowthValue && (
          <div className="dashboard-header-right">
            <div className="dashboard-header-meta-group">
              <div className="dashboard-header-label">Last Updated</div>
              <div className="dashboard-header-meta">{updatedValue}</div>
            </div>
            <div className="dashboard-header-meta-group-right">
              <div className="dashboard-header-label">Growth Since</div>
              <div className="dashboard-header-meta">{growthValue}</div>
            </div>
          </div>
        )}
      </div>

      <div className="dashboard-header-actions">
        {showDate && (
          <div className="dashboard-date-action">
            <label className="dashboard-date-control">
              <span className="dashboard-header-label">REPORT DATE</span>
              <span className="dashboard-date-select-wrap">
                <select
                  value={showDate}
                  onChange={(event) => onDateChange?.(event.target.value)}
                  aria-label={`Select ${salesMode === 'advance' ? 'advance' : 'total sales'} report date`}
                >
                  {dateOptions.length > 0
                    ? dateOptions.map((date) => (
                      <option key={date} value={date}>
                        {date}
                      </option>
                    ))
                    : <option value={showDate}>{showDate}</option>}
                </select>
              </span>
            </label>
          </div>
        )}
        <div className={`dashboard-header-right-actions ${rightActionsClassName}`}>
          {renderActions(rightActions)}
        </div>
      </div>
    </div>
  );
};
