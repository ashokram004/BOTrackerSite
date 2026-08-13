export const DashboardHeader = ({
  marketLabel = 'Box Office Tracking',
  movieName = '',
  showDate = '',
  lastUpdated = '',
  leftActions = [],
  rightActions = []
}) => {
  return (
    <div className="dashboard-header-shell">
      <div className="dashboard-header-main">
        <div className="dashboard-header-left">
          <div className="dashboard-header-label">{marketLabel}</div>
          <div className="dashboard-header-title">{movieName}</div>
          {showDate && (
            <div className="dashboard-header-subtext">
              Show Date: <strong>{showDate}</strong>
            </div>
          )}
        </div>

        <div className="dashboard-header-right">
          <div className="dashboard-header-label">Last Updated</div>
          <div className="dashboard-header-meta">{lastUpdated}</div>
        </div>
      </div>

      <div className="dashboard-header-actions">
        <div className="dashboard-header-left-actions">
          {leftActions.map((action, index) => (
            <button
              key={action.key || `${action.label}-${index}`}
              type="button"
              className={action.variant === 'primary' ? 'dashboard-action-btn primary' : 'dashboard-action-btn secondary'}
              onClick={action.onClick}
              style={action.style}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ))}
        </div>

        <div className="dashboard-header-right-actions">
          {rightActions.map((action, index) => (
            <button
              key={action.key || `${action.label}-${index}`}
              type="button"
              className={action.variant === 'primary' ? 'dashboard-action-btn primary' : 'dashboard-action-btn secondary'}
              onClick={action.onClick}
              style={action.style}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
