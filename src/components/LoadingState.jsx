export const LoadingState = ({ label }) => (
  <div className="loading-state" role="status" aria-live="polite">
    <span className="loading-spinner" aria-hidden="true" />
    <span>{label}</span>
  </div>
);
