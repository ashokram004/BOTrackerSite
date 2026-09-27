import { useEffect, useRef } from 'react';

export const MultiSelectFilter = ({ label, allLabel, options, selectedValues, onChange, exclusiveValues = [] }) => {
  const detailsRef = useRef(null);
  const selectedLabel = selectedValues.length === 0
    ? allLabel
    : selectedValues.length === 1
      ? options.find((option) => option.value === selectedValues[0])?.label || '1 selected'
      : `${selectedValues.length} selected`;
  const regularOptions = options.filter((option) => !exclusiveValues.includes(option.value));
  const exclusiveSelected = selectedValues.some((value) => exclusiveValues.includes(value));
  const allSelected = regularOptions.length > 0 && regularOptions.every((option) => selectedValues.includes(option.value));

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target)) {
        detailsRef.current.open = false;
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false;
      }
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const toggleValue = (value) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((selectedValue) => selectedValue !== value));
    } else if (exclusiveValues.includes(value)) {
      onChange([value]);
      if (detailsRef.current) detailsRef.current.open = false;
    } else {
      onChange([
        ...selectedValues.filter((selectedValue) => !exclusiveValues.includes(selectedValue)),
        value
      ]);
    }
  };

  return (
    <div className="multi-select-filter">
      <div className="filter-label">{label}</div>
      <details ref={detailsRef}>
        <summary className="filter-select multi-select-trigger">
          <span>{selectedLabel}</span>
          <span aria-hidden="true">▾</span>
        </summary>
        <div className="multi-select-menu">
          <button
            className="multi-select-action"
            type="button"
            onClick={() => onChange(allSelected ? [] : regularOptions.map((option) => option.value))}
          >
            {allSelected ? 'Clear selection' : 'Select all'}
          </button>
          {options.map((option) => (
            <label className="multi-select-option" key={option.value}>
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                disabled={exclusiveSelected && !exclusiveValues.includes(option.value)}
                onChange={() => toggleValue(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
};