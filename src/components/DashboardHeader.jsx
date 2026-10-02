export const DEFAULT_MOVIE_POSTER_URL = 'https://drive.google.com/thumbnail?id=15N4n9XlpRgxsAui3T7SQd02yZUMSmSLD&sz=w1000';

const DashboardActionIcon = ({ name }) => {
  const icons = {
    movie: (
      <>
        <path d="M4 8.5h16v11H4z" />
        <path d="m4 8.5 3-4h3l-3 4m3 0 3-4h3l-3 4m3 0 3-4h3l-3 4" />
        <path d="M8 12v2m4-2v2m4-2v2" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M19 12a7 7 0 0 0-12-4L5 10m-1 7v-5h5" />
        <path d="M5 12a7 7 0 0 0 12 4l2-2" />
      </>
    ),
    filter: (
      <>
        <path d="M4 5h16l-6.5 7.5v5l-3 1.5v-6.5z" />
      </>
    ),
    growth: (
      <>
        <path d="M4 19V5m0 14h16" />
        <path d="m7 15 4-4 3 2 5-6" />
        <path d="M15.5 7H19v3.5" />
      </>
    ),
    export: (
      <>
        <path d="M12 15V4m0 0L8 8m4-4 4 4" />
        <path d="M5 13v6h14v-6" />
      </>
    ),
    current: (
      <>
        <path d="M4 19V5m0 14h16" />
        <path d="m7 15 4-4 3 2 5-6" />
      </>
    ),
    advance: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3.5 2" />
      </>
    )
  };

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icons[name] || null}
    </svg>
  );
};

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
      className={`dashboard-action-btn ${action.variant === 'primary' ? 'primary' : action.variant === 'accent' ? 'accent' : 'secondary'}${action.neutralHoverWhenInactive ? ' dashboard-action-btn--neutral-inactive-hover' : ''}${action.isActive && action.activeStyle ? ` ${action.activeStyle}` : ''}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={action.onClick}
      style={action.style}
      disabled={action.disabled}
      aria-pressed={action.isActive}
      aria-label={action.ariaLabel || action.label}
    >
      <span className="dashboard-action-label-full">
        {action.icon && <DashboardActionIcon name={action.icon} />}
        {action.label}
      </span>
      {action.mobileLabel && (
        <span className="dashboard-action-label-mobile">
          {action.mobileIcon && <DashboardActionIcon name={action.mobileIcon} />}
          {action.mobileLabel}
        </span>
      )}
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
                        aria-label={option.label}
                        onClick={() => onSalesModeChange?.(option.value)}
                      >
                        <span className="dashboard-sales-label-full">{option.label}</span>
                        <span className="dashboard-sales-label-mobile">
                          {option.mobileIcon && <DashboardActionIcon name={option.mobileIcon} />}
                          {option.mobileLabel || option.label}
                        </span>
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
              <span className="dashboard-header-label">
                <span className="dashboard-date-label-full">SHOW DATE</span>
                <span className="dashboard-date-label-mobile">SHOW DATE</span>
              </span>
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
