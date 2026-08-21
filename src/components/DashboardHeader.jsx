export const DashboardHeader = ({
  marketLabel = 'Box Office Tracking',
  movieName = '',
  showDate = '',
  lastUpdated = '',
  leftActions = [],
  rightActions = []
}) => {
  let [updatedValue, growthValue] = String(lastUpdated || '').split(' • Growth since ');
  updatedValue = updatedValue.toUpperCase();
  updatedValue = updatedValue.endsWith('IST') ? updatedValue : `${updatedValue} IST`;
  growthValue = growthValue ? growthValue.toUpperCase() : '';
  const hasGrowthValue = Boolean(
    growthValue &&
    !/^(n\/a|na|null|undefined|-)(\s|$)/i.test(growthValue.trim())
  );

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
          <div className="dashboard-header-meta-group">
            <div className="dashboard-header-label">Last Updated</div>
            <div className="dashboard-header-meta">{updatedValue}</div>
          </div>
          {hasGrowthValue && (
            <div className="dashboard-header-meta-group">
              <div className="dashboard-header-label">Growth Since</div>
              <div className="dashboard-header-meta">{growthValue}</div>
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-header-actions">
        <div className="dashboard-header-left-actions">
          {leftActions.map((action, index) => (
            <button
              key={action.key || `${action.label}-${index}`}
              type="button"
              className={`dashboard-action-btn ${action.variant === 'primary' ? 'primary' : action.variant === 'accent' ? 'accent' : 'secondary'}`}
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
              className={`dashboard-action-btn ${action.variant === 'primary' ? 'primary' : action.variant === 'accent' ? 'accent' : 'secondary'}`}
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
